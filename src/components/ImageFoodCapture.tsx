import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Html5Qrcode, Html5QrcodeSupportedFormats, type Html5QrcodeCameraScanConfig } from "html5-qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { toast } from "sonner";
import { FoodCategory } from "@/types";
import { logger } from "@/lib/logger";
import { PHOTO_AI_NOTICE } from "@/lib/aiSafety";
import '@/i18n/appLocale';


/** Camera constraints html5-qrcode passes through that the DOM lib does not declare. */
type CameraConstraints = MediaTrackConstraints & {
  focusMode?: string;
  advanced?: Array<MediaTrackConstraintSet & { zoom?: number }>;
};

export interface FoodIdentification {
  name: string;
  variety?: string;
  varietyOptions?: string[];
  category: FoodCategory;
  confidence: number;
  description: string;
  servingSize: string;
  quantity: number;
  servingSizeOptions?: string[];
  // No is_safe (US-803). A photo says what a food is, not whether a child
  // eats it, so this shape has nowhere to carry that answer: the page adds
  // the food with ACQUIRED_FOOD_IS_SAFE like every other capture path.
}

interface ImageFoodCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFoodIdentified: (foodData: FoodIdentification) => void;
}

export function ImageFoodCapture({ open, onOpenChange, onFoodIdentified }: ImageFoodCaptureProps) {
  const { t } = useTranslation();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [identifiedFood, setIdentifiedFood] = useState<FoodIdentification | null>(null);
  const [editedServingSize, setEditedServingSize] = useState<string>("");
  const [editedQuantity, setEditedQuantity] = useState<string>("1");
  const [editedVariety, setEditedVariety] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const [showCamera, setShowCamera] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
  const quantityValid = editedQuantity.trim().length > 0 && /^\d+$/.test(editedQuantity) && parseInt(editedQuantity) >= 1;
  const startCamera = async () => {
    try {
      logger.debug('Starting Html5Qrcode camera...');
      setCapturedImage(null);
      setIdentifiedFood(null);
      setShowCamera(true);

      // Allow DOM to render the container
      await new Promise((r) => setTimeout(r, 50));

      // Clean up any previous instance
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
          await scannerRef.current.clear();
        } catch (error) {
          // Ignore cleanup errors - scanner may already be stopped
          logger.debug('Scanner cleanup error (expected):', error);
        }
        scannerRef.current = null;
      }

      const containerId = 'food-camera';
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        throw new Error('No cameras found');
      }
      const back = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];

      const config: Omit<Html5QrcodeCameraScanConfig, "videoConstraints"> & {
        videoConstraints: CameraConstraints;
        formatsToSupport: Html5QrcodeSupportedFormats[];
        experimentalFeatures: { useBarCodeDetectorIfSupported: boolean };
      } = {
        fps: 10,
        aspectRatio: 1.777,
        qrbox: undefined,
        disableFlip: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        videoConstraints: {
          deviceId: back.id,
          facingMode: 'environment',
          focusMode: 'continuous',
          advanced: [{ zoom: 1.5 }],
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      };

      await scanner.start(
        back.id,
        config,
        () => { /* no-op decode callback */ },
        () => { /* ignore decode errors */ }
      );

      logger.debug('Html5Qrcode camera started on device:', back.label || back.id);
    } catch (error) {
      logger.error('Error starting camera with Html5Qrcode:', error);
      toast.error(t("pantry.photo.cameraError", "Camera error"), {
        description:
          (error instanceof Error ? error.message : t("pantry.photo.cameraUnavailable", "Unable to access camera")) +
          (isEmbedded ? ` ${t("pantry.photo.embeddedHint", "(an embedded preview may block the camera; open in a new tab)")}` : ""),
      });
      setShowCamera(false);
    }
  };

  const stopCamera = async () => {
    // Taken off the ref before stopping, so a second call (unmount racing a
    // close) finds nothing to stop instead of stopping the same one twice.
    const scanner = scannerRef.current;
    scannerRef.current = null;
    try {
      if (scanner) {
        await scanner.stop();
        await scanner.clear();
      }
    } catch (e) {
      logger.error('Error stopping camera:', e);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (mountedRef.current) setShowCamera(false);
  };

  // The camera light must go off when the dialog does. Closing by route
  // change or by the parent flipping `open` never ran handleClose, so the
  // stream kept running behind a closed dialog.
  const stopCameraRef = useRef(stopCamera);
  stopCameraRef.current = stopCamera;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopCameraRef.current();
    };
  }, []);
  useEffect(() => {
    if (!open) void stopCameraRef.current();
  }, [open]);

  const capturePhoto = async () => {
    const videoEl = document.querySelector('#food-camera video') as HTMLVideoElement | null;
    if (!videoEl) {
      logger.error('No video element found in scanner container');
      toast.error(t("pantry.photo.notReady", "Camera not ready"), {
        description: t("pantry.photo.notReadyHint", "Wait a moment for the camera to load"),
      });
      return;
    }

    logger.debug('Video dimensions:', videoEl.videoWidth, 'x', videoEl.videoHeight);

    if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      toast.error(t("pantry.photo.notReady", "Camera not ready"), {
        description: t("pantry.photo.notReadyHint", "Wait a moment for the camera to load"),
      });
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoEl, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.85);
      logger.debug('Image captured, data URL length:', imageData.length);
      setCapturedImage(imageData);
      await stopCamera();
      analyzeImage(imageData);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setCapturedImage(imageData);
      analyzeImage(imageData);
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (imageBase64: string) => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await invokeEdgeFunction<{
        success?: boolean;
        error?: string;
        foodData?: FoodIdentification;
      }>('identify-food-image', {
        body: { imageBase64 }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.foodData) {
        const found: FoodIdentification = data.foodData;
        setIdentifiedFood(found);
        setEditedServingSize(found.servingSize);
        setEditedQuantity(String(found.quantity || 1));
        setEditedVariety(found.variety || "");
        toast(t("pantry.photo.identified", "Food identified"), {
          description: found.variety
            ? t("pantry.photo.foundVariety", {
                defaultValue: "Found {{name}} ({{variety}}), {{confidence}}% sure",
                name: found.name,
                variety: found.variety,
                confidence: found.confidence,
              })
            : t("pantry.photo.found", {
                defaultValue: "Found {{name}}, {{confidence}}% sure",
                name: found.name,
                confidence: found.confidence,
              }),
        });
      }
    } catch (error) {
      logger.error('Error analyzing image:', error);
      toast.error(t("pantry.photo.analysisFailed", "Couldn't identify that"), {
        description: error instanceof Error ? error.message : t("pantry.photo.analysisFailedHint", "Try a clearer photo"),
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddFood = () => {
    if (!identifiedFood) return;
    const qtyNum = parseInt(editedQuantity);
    if (!editedQuantity || isNaN(qtyNum) || qtyNum < 1) {
      toast.error(t("pantry.photo.quantityRequired", "Quantity required"), {
        description: t("pantry.photo.quantityHint", "Enter a quantity of 1 or more."),
      });
      return;
    }
    
    // Construct the final food name with variety if selected
    const finalName = editedVariety && editedVariety !== "Generic" 
      ? `${editedVariety} ${identifiedFood.name}`
      : identifiedFood.name;
    
    onFoodIdentified({
      ...identifiedFood,
      name: finalName,
      servingSize: editedServingSize,
      quantity: qtyNum,
    });
    handleClose();
  };

  const handleClose = () => {
    void stopCamera();
    setCapturedImage(null);
    setIdentifiedFood(null);
    onOpenChange(false);
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setIdentifiedFood(null);
    setEditedServingSize("");
    setEditedQuantity("1");
    setEditedVariety("");
    startCamera();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{t("pantry.photo.title", "Identify a food by photo")}</DialogTitle>
          <DialogDescription>
            {t("pantry.photo.description", "Take or upload a photo and we'll name the food for you to check.")}
          </DialogDescription>
          {/* US-632: say where the photo goes before it is taken, not after. */}
          <p className="text-xs text-muted-foreground">{PHOTO_AI_NOTICE}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {!capturedImage && !showCamera && (
            <div className="flex flex-col gap-3">
              <Button
                onClick={startCamera}
                className="w-full"
                size="lg"
              >
                <Camera className="h-5 w-5 mr-2" />
                {t("pantry.photo.takePhoto", "Take photo")}
              </Button>
              
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <Upload className="h-5 w-5 mr-2" />
                {t("pantry.photo.upload", "Upload image")}
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}

          {showCamera && (
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden bg-black">
                <div id="food-camera" className="w-full aspect-video" />
                <button
                  type="button"
                  onClick={capturePhoto}
                  aria-label={t("pantry.photo.tapToCapture", "Tap to capture")}
                  className="absolute inset-0 z-10 bg-transparent focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring"
                />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-background/60 text-foreground/80 text-xs">
                  {t("pantry.photo.tapHint", "Tap the video or press Capture")}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={capturePhoto} className="flex-1" size="lg">
                  <Camera className="h-5 w-5 mr-2" />
                  {t("pantry.photo.capture", "Capture")}
                </Button>
                <Button
                  aria-label={t("pantry.photo.stopCamera", "Stop the camera")} onClick={() => void stopCamera()} variant="outline" size="lg">
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          {capturedImage && (
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden border">
                <img src={capturedImage} alt={t("pantry.photo.capturedAlt", "Captured food")} className="w-full" />
              </div>

              {isAnalyzing && (
                <Card>
                  <CardContent className="flex items-center justify-center py-8">
                    <div className="text-center space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                      <p className="text-sm text-muted-foreground">{t("pantry.photo.analyzing", "Looking at the photo...")}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {identifiedFood && !isAnalyzing && (
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="photo-food-name">{t("pantry.photo.identifiedLabel", "Identified food")}</Label>
                      <Input id="photo-food-name" value={identifiedFood.name} readOnly />
                    </div>

                    {identifiedFood.varietyOptions && identifiedFood.varietyOptions.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="photo-food-variety">{t("pantry.photo.varietyLabel", "Variety (optional)")}</Label>
                        <select
                          id="photo-food-variety"
                          value={editedVariety}
                          onChange={(e) => setEditedVariety(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <option value="">{t("pantry.photo.generic", { defaultValue: "Any {{name}}", name: identifiedFood.name })}</option>
                          {identifiedFood.varietyOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          {t("pantry.photo.savedAs", {
                            defaultValue: "Saved as {{name}}",
                            name: editedVariety ? `${editedVariety} ${identifiedFood.name}` : identifiedFood.name,
                          })}
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="photo-food-category">{t("pantry.photo.categoryLabel", "Category")}</Label>
                        <Input id="photo-food-category" value={identifiedFood.category} readOnly className="capitalize" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="photo-food-confidence">{t("pantry.photo.confidenceLabel", "Confidence")}</Label>
                        <Input id="photo-food-confidence" value={`${identifiedFood.confidence}%`} readOnly />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="photo-food-serving">{t("pantry.photo.servingLabel", "Serving size")}</Label>
                        {identifiedFood.servingSizeOptions && identifiedFood.servingSizeOptions.length > 0 ? (
                          <select
                            id="photo-food-serving"
                            value={editedServingSize}
                            onChange={(e) => setEditedServingSize(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {identifiedFood.servingSizeOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            id="photo-food-serving"
                            value={editedServingSize}
                            onChange={(e) => setEditedServingSize(e.target.value)}
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="photo-food-quantity">{t("pantry.photo.quantityLabel", "Quantity")}</Label>
                        <Input
                          id="photo-food-quantity"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder={t("pantry.photo.quantityPlaceholder", "e.g., 6")}
                          value={editedQuantity}
                          onChange={(e) => {
                            const next = e.target.value.replace(/[^0-9]/g, '');
                            setEditedQuantity(next);
                          }}
                          aria-invalid={!quantityValid}
                          className={!quantityValid ? "border-destructive focus-visible:ring-destructive" : undefined}
                        />
                        {!quantityValid && (
                          <p className="text-xs text-destructive">{t("pantry.photo.quantityRequired", "Quantity required")}</p>
                        )}
                      </div>
                      </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">{t("pantry.photo.descriptionLabel", "Description")}</p>
                      <p className="text-sm text-muted-foreground">{identifiedFood.description}</p>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button onClick={handleAddFood} className="flex-1" size="lg" disabled={!quantityValid}>
                        {t("pantry.photo.add", "Add to pantry")}
                      </Button>
                      <Button onClick={retakePhoto} variant="outline" size="lg">
                        {t("pantry.photo.retake", "Retake")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
