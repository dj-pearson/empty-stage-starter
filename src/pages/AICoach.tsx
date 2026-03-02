import { Helmet } from "react-helmet-async";
import { AIMealCoach } from "@/components/AIMealCoach";

export default function AICoach() {
  return (
    <>
      <Helmet>
        <title>AI Coach - EatPal</title>
        <meta name="description" content="Get personalized meal planning and nutrition advice from our AI coach" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="container mx-auto py-6 px-4 max-w-7xl">
        <AIMealCoach />
      </div>
    </>
  );
}
