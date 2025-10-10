import { useState, useRef } from "react";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FoodCategory } from "@/types";

interface FoodIdentification {
  name: string;
  category: FoodCategory;
  confidence: number;
  description: string;
  servingSize: string;
}

interface ImageFoodCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFoodIdentified: (foodData: FoodIdentification) => void;
}

export function ImageFoodCapture({ open, onOpenChange, onFoodIdentified }: ImageFoodCaptureProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [identifiedFood, setIdentifiedFood] = useState<FoodIdentification | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

  const startCamera = async () => {
    try {
      console.log('Starting Html5Qrcode camera...');
      setCapturedImage(null);
      setIdentifiedFood(null);
      setShowCamera(true);

      // Allow DOM to render the container
      await new Promise((r) => setTimeout(r, 50));

      // Clean up any previous instance
      if (scannerRef.current) {
        try { await scannerRef.current.stop(); await scannerRef.current.clear(); } catch {}
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

      const config: any = {
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

      console.log('Html5Qrcode camera started on device:', back.label || back.id);
    } catch (error) {
      console.error('Error starting camera with Html5Qrcode:', error);
      toast({
        title: "Camera Error",
        description: (error instanceof Error ? error.message : 'Unable to access camera') + (isEmbedded ? ' (embedded preview may restrict camera; open in a new tab if issues persist)' : ''),
        variant: "destructive",
      });
      setShowCamera(false);
    }
  };

  const stopCamera = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (e) {
      console.error('Error stopping camera:', e);
    }

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = async () => {
    const videoEl = document.querySelector('#food-camera video') as HTMLVideoElement | null;
    if (!videoEl) {
      console.error('No video element found in scanner container');
      toast({
        title: "Camera Not Ready",
        description: "Please wait for the camera to fully load",
        variant: "destructive",
      });
      return;
    }

    console.log('Video dimensions:', videoEl.videoWidth, 'x', videoEl.videoHeight);

    if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      toast({
        title: "Camera Not Ready",
        description: "Please wait for the camera to fully load",
        variant: "destructive",
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
      console.log('Image captured, data URL length:', imageData.length);
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
      const { data, error } = await supabase.functions.invoke('identify-food-image', {
        body: { imageBase64 }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.foodData) {
        setIdentifiedFood(data.foodData);
        toast({
          title: "Food Identified!",
          description: `Found: ${data.foodData.name} (${data.foodData.confidence}% confident)`,
        });
      }
    } catch (error) {
      console.error('Error analyzing image:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to identify food from image",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddFood = () => {
    if (identifiedFood) {
      onFoodIdentified(identifiedFood);
      handleClose();
    }
  };

  const handleClose = () => {
    stopCamera();
    setCapturedImage(null);
    setIdentifiedFood(null);
    onOpenChange(false);
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setIdentifiedFood(null);
    startCamera();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Identify Food by Photo</DialogTitle>
          <DialogDescription>
            Take a photo or upload an image to automatically identify and add food items
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!capturedImage && !showCamera && (
            <div className="flex flex-col gap-3">
              <Button
                onClick={startCamera}
                className="w-full"
                size="lg"
              >
                <Camera className="h-5 w-5 mr-2" />
                Take Photo
              </Button>
              
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <Upload className="h-5 w-5 mr-2" />
                Upload Image
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
                  aria-label="Tap to capture"
                  className="absolute inset-0 z-10 bg-transparent focus:outline-none"
                />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-background/60 text-foreground/80 text-xs">
                  Tap video or press Capture
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={capturePhoto} className="flex-1" size="lg">
                  <Camera className="h-5 w-5 mr-2" />
                  Capture
                </Button>
                <Button onClick={stopCamera} variant="outline" size="lg">
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          {capturedImage && (
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden border">
                <img src={capturedImage} alt="Captured food" className="w-full" />
              </div>

              {isAnalyzing && (
                <Card>
                  <CardContent className="flex items-center justify-center py-8">
                    <div className="text-center space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                      <p className="text-sm text-muted-foreground">Analyzing image...</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {identifiedFood && !isAnalyzing && (
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                      <Label>Identified Food</Label>
                      <Input value={identifiedFood.name} readOnly />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Input value={identifiedFood.category} readOnly className="capitalize" />
                      </div>
                      <div className="space-y-2">
                        <Label>Confidence</Label>
                        <Input value={`${identifiedFood.confidence}%`} readOnly />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Serving Size</Label>
                      <Input value={identifiedFood.servingSize} readOnly />
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <p className="text-sm text-muted-foreground">{identifiedFood.description}</p>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button onClick={handleAddFood} className="flex-1" size="lg">
                        Add to Pantry
                      </Button>
                      <Button onClick={retakePhoto} variant="outline" size="lg">
                        Retake
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
