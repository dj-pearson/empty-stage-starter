import { useState, useRef } from "react";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const startCamera = async () => {
    try {
      console.log('Requesting camera access...');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      console.log('Camera stream obtained:', mediaStream.active);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        console.log('Stream assigned to video element');
        
        // Wait for video metadata to load
        videoRef.current.onloadedmetadata = async () => {
          console.log('Video metadata loaded, attempting to play...');
          try {
            await videoRef.current?.play();
            console.log('Video playing successfully');
          } catch (playError) {
            console.error('Error playing video:', playError);
            toast({
              title: "Video Play Error",
              description: "Unable to start video playback",
              variant: "destructive",
            });
          }
        };
      }
      
      setStream(mediaStream);
      setShowCamera(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) {
      console.error('Video ref not available');
      return;
    }

    console.log('Video dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);

    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      toast({
        title: "Camera Not Ready",
        description: "Please wait for the camera to fully load",
        variant: "destructive",
      });
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      console.log('Image captured, data URL length:', imageData.length);
      setCapturedImage(imageData);
      stopCamera();
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
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  // @ts-ignore - iOS requires this attribute
                  webkit-playsinline="true"
                  className="w-full"
                />
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
