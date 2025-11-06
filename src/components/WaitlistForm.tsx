import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const WaitlistForm = () => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate("/auth");
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="bg-primary/10 p-3 rounded-full">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle className="text-3xl font-heading font-bold text-primary">
          Start Planning Meals Today
        </CardTitle>
        <CardDescription className="text-base">
          Create your free account and transform meal planning for your picky eater
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button
            onClick={handleGetStarted}
            size="lg"
            className="w-full h-12 text-lg font-semibold"
          >
            Get Started Free
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Free forever plan available • No credit card required • 14-day money-back guarantee on paid plans
          </p>
        </div>
      </CardContent>
    </Card>
  );
};