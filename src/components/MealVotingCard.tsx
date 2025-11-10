import { useState } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, ChefHat, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type VoteType = 'love_it' | 'okay' | 'no_way' | null;

interface MealVotingCardProps {
  mealName: string;
  mealSlot: string;
  mealDate: string;
  imageUrl?: string;
  prepTime?: string;
  cookTime?: string;
  servings?: number;
  difficulty?: string;
  description?: string;
  onVote: (vote: VoteType) => void;
  className?: string;
}

const SWIPE_THRESHOLD = 100;
const VOTE_EMOJIS = {
  love_it: '😍',
  okay: '🙂',
  no_way: '😭',
};

const VOTE_LABELS = {
  love_it: 'Love It!',
  okay: 'It\'s Okay',
  no_way: 'No Way',
};

const VOTE_COLORS = {
  love_it: 'bg-green-500',
  okay: 'bg-yellow-500',
  no_way: 'bg-red-500',
};

export function MealVotingCard({
  mealName,
  mealSlot,
  mealDate,
  imageUrl,
  prepTime,
  cookTime,
  servings,
  difficulty,
  description,
  onVote,
  className,
}: MealVotingCardProps) {
  const [exitX, setExitX] = useState(0);
  const [exitY, setExitY] = useState(0);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Rotation based on horizontal drag
  const rotate = useTransform(x, [-200, 200], [-25, 25]);

  // Opacity for vote overlays
  const loveOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const noWayOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const okayOpacity = useTransform(y, [-SWIPE_THRESHOLD, 0], [1, 0]);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset, velocity } = info;

    // Check for vertical swipe (okay vote)
    if (offset.y < -SWIPE_THRESHOLD || velocity.y < -500) {
      setExitY(-500);
      onVote('okay');
      return;
    }

    // Check for horizontal swipes
    if (offset.x > SWIPE_THRESHOLD || velocity.x > 500) {
      // Swipe right - Love it!
      setExitX(500);
      onVote('love_it');
    } else if (offset.x < -SWIPE_THRESHOLD || velocity.x < -500) {
      // Swipe left - No way
      setExitX(-500);
      onVote('no_way');
    }
  };

  // Format date nicely
  const formattedDate = new Date(mealDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const totalTime = (parseInt(prepTime || "0") + parseInt(cookTime || "0")) || null;

  return (
    <motion.div
      className={cn("absolute inset-0 flex items-center justify-center p-4", className)}
      style={{ x, y, rotate }}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={1}
      onDragEnd={handleDragEnd}
      animate={{
        x: exitX,
        y: exitY,
        opacity: exitX !== 0 || exitY !== 0 ? 0 : 1,
        scale: exitX !== 0 || exitY !== 0 ? 0.8 : 1,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 20,
      }}
    >
      <Card className="w-full max-w-md h-[500px] overflow-hidden shadow-2xl cursor-grab active:cursor-grabbing select-none">
        {/* Love It Overlay */}
        <motion.div
          className="absolute inset-0 bg-green-500/90 z-10 flex items-center justify-center"
          style={{ opacity: loveOpacity }}
        >
          <div className="text-center">
            <div className="text-8xl mb-4">{VOTE_EMOJIS.love_it}</div>
            <div className="text-4xl font-bold text-white">{VOTE_LABELS.love_it}</div>
          </div>
        </motion.div>

        {/* No Way Overlay */}
        <motion.div
          className="absolute inset-0 bg-red-500/90 z-10 flex items-center justify-center"
          style={{ opacity: noWayOpacity }}
        >
          <div className="text-center">
            <div className="text-8xl mb-4">{VOTE_EMOJIS.no_way}</div>
            <div className="text-4xl font-bold text-white">{VOTE_LABELS.no_way}</div>
          </div>
        </motion.div>

        {/* Okay Overlay */}
        <motion.div
          className="absolute inset-0 bg-yellow-500/90 z-10 flex items-center justify-center"
          style={{ opacity: okayOpacity }}
        >
          <div className="text-center">
            <div className="text-8xl mb-4">{VOTE_EMOJIS.okay}</div>
            <div className="text-4xl font-bold text-white">{VOTE_LABELS.okay}</div>
          </div>
        </motion.div>

        {/* Card Content */}
        <div className="relative h-full flex flex-col">
          {/* Image */}
          {imageUrl ? (
            <div className="relative h-2/3 overflow-hidden">
              <img
                src={imageUrl}
                alt={mealName}
                className="w-full h-full object-cover"
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

              {/* Date badge */}
              <div className="absolute top-4 left-4">
                <Badge className="bg-black/60 backdrop-blur-sm text-white border-0 text-sm">
                  {formattedDate}
                </Badge>
              </div>

              {/* Meal slot badge */}
              <div className="absolute top-4 right-4">
                <Badge className="bg-primary/90 backdrop-blur-sm border-0 capitalize text-sm">
                  {mealSlot}
                </Badge>
              </div>

              {/* Meal name at bottom of image */}
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-3xl font-bold text-white drop-shadow-lg">
                  {mealName}
                </h2>
              </div>
            </div>
          ) : (
            <div className="relative h-2/3 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <div className="text-center p-6">
                <div className="text-6xl mb-4">🍽️</div>
                <Badge className="mb-2 text-xs">{formattedDate}</Badge>
                <h2 className="text-2xl font-bold mb-1">{mealName}</h2>
                <Badge variant="outline" className="capitalize">{mealSlot}</Badge>
              </div>
            </div>
          )}

          {/* Info Section */}
          <CardContent className="flex-1 flex flex-col justify-between p-6">
            {description && (
              <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                {description}
              </p>
            )}

            {/* Meta info */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {totalTime && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  <span>{totalTime} min</span>
                </div>
              )}

              {difficulty && (
                <div className="flex items-center gap-1.5">
                  <ChefHat className="h-4 w-4" />
                  <span className="capitalize">{difficulty}</span>
                </div>
              )}

              {servings && (
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  <span>{servings} servings</span>
                </div>
              )}
            </div>

            {/* Swipe instructions */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="text-2xl">{VOTE_EMOJIS.no_way}</span>
                  <span>Swipe left</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-2xl">{VOTE_EMOJIS.okay}</span>
                  <span>Swipe up</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>Swipe right</span>
                  <span className="text-2xl">{VOTE_EMOJIS.love_it}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </div>
      </Card>
    </motion.div>
  );
}
