import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Kid } from "@/types";
import { cn } from "@/lib/utils";

interface VoteResult {
  kidId: string;
  kidName: string;
  vote: 'love_it' | 'okay' | 'no_way';
  voteEmoji: string;
  votedAt: string;
}

interface VoteSummary {
  totalVotes: number;
  loveItCount: number;
  okayCount: number;
  noWayCount: number;
  approvalScore: number;
  votes: VoteResult[];
}

interface VoteResultsDisplayProps {
  planEntryId?: string;
  recipeId?: string;
  mealDate?: string;
  mealSlot?: string;
  kids: Kid[];
  compact?: boolean;
  className?: string;
}

export function VoteResultsDisplay({
  planEntryId,
  recipeId,
  mealDate,
  mealSlot,
  kids,
  compact = false,
  className,
}: VoteResultsDisplayProps) {
  const [voteSummary, setVoteSummary] = useState<VoteSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadVotes();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('vote-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meal_votes',
          filter: planEntryId ? `plan_entry_id=eq.${planEntryId}` : undefined,
        },
        () => {
          loadVotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [planEntryId, recipeId, mealDate, mealSlot]);

  const loadVotes = async () => {
    try {
      // @ts-ignore - meal_votes table exists but types not yet regenerated
      let query = supabase.from('meal_votes').select(`
        kid_id,
        vote,
        vote_emoji,
        voted_at,
        kids (
          id,
          name
        )
      `);

      if (planEntryId) {
        query = query.eq('plan_entry_id', planEntryId);
      } else if (recipeId && mealDate && mealSlot) {
        query = query
          .eq('recipe_id', recipeId)
          .eq('meal_date', mealDate)
          .eq('meal_slot', mealSlot);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Process votes
      const votes: VoteResult[] = (data || []).map((v: any) => ({
        kidId: v.kid_id,
        kidName: v.kids.name,
        vote: v.vote,
        voteEmoji: v.vote_emoji,
        votedAt: v.voted_at,
      }));

      const loveItCount = votes.filter(v => v.vote === 'love_it').length;
      const okayCount = votes.filter(v => v.vote === 'okay').length;
      const noWayCount = votes.filter(v => v.vote === 'no_way').length;
      const totalVotes = votes.length;

      // Calculate approval score (love_it=100, okay=50, no_way=0)
      const approvalScore = totalVotes > 0
        ? Math.round(((loveItCount * 100) + (okayCount * 50)) / totalVotes)
        : 0;

      setVoteSummary({
        totalVotes,
        loveItCount,
        okayCount,
        noWayCount,
        approvalScore,
        votes,
      });
    } catch (error) {
      console.error('Error loading votes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return null;
  }

  if (!voteSummary || voteSummary.totalVotes === 0) {
    return null; // No votes yet
  }

  const getApprovalBadge = (score: number) => {
    if (score >= 80) {
      return (
        <Badge className="bg-green-500 hover:bg-green-600">
          <TrendingUp className="h-3 w-3 mr-1" />
          {score}% Approved
        </Badge>
      );
    } else if (score >= 50) {
      return (
        <Badge className="bg-yellow-500 hover:bg-yellow-600">
          <Minus className="h-3 w-3 mr-1" />
          {score}% Mixed
        </Badge>
      );
    } else {
      return (
        <Badge variant="destructive">
          <TrendingDown className="h-3 w-3 mr-1" />
          {score}% Low
        </Badge>
      );
    }
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {/* Vote emojis */}
        <div className="flex -space-x-2">
          {voteSummary.votes.map((vote, index) => (
            <TooltipProvider key={index}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-8 h-8 rounded-full bg-background border-2 border-background flex items-center justify-center text-lg">
                    {vote.voteEmoji}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{vote.kidName}: {vote.vote === 'love_it' ? 'Love it!' : vote.vote === 'okay' ? "It's okay" : 'No way'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>

        {/* Approval badge */}
        {getApprovalBadge(voteSummary.approvalScore)}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Kid Votes
          </CardTitle>
          {getApprovalBadge(voteSummary.approvalScore)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Vote breakdown */}
        <div className="space-y-2">
          {/* Love It */}
          {voteSummary.loveItCount > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">😍</span>
                  <span>Love It!</span>
                </div>
                <span className="font-semibold">{voteSummary.loveItCount}</span>
              </div>
              <Progress
                value={(voteSummary.loveItCount / voteSummary.totalVotes) * 100}
                className="h-2 bg-green-100"
                indicatorClassName="bg-green-500"
              />
            </div>
          )}

          {/* Okay */}
          {voteSummary.okayCount > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🙂</span>
                  <span>It's Okay</span>
                </div>
                <span className="font-semibold">{voteSummary.okayCount}</span>
              </div>
              <Progress
                value={(voteSummary.okayCount / voteSummary.totalVotes) * 100}
                className="h-2 bg-yellow-100"
                indicatorClassName="bg-yellow-500"
              />
            </div>
          )}

          {/* No Way */}
          {voteSummary.noWayCount > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">😭</span>
                  <span>No Way</span>
                </div>
                <span className="font-semibold">{voteSummary.noWayCount}</span>
              </div>
              <Progress
                value={(voteSummary.noWayCount / voteSummary.totalVotes) * 100}
                className="h-2 bg-red-100"
                indicatorClassName="bg-red-500"
              />
            </div>
          )}
        </div>

        <Separator />

        {/* Individual votes */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Votes by Child</h4>
          {voteSummary.votes.map((vote, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <div className="text-2xl">{vote.voteEmoji}</div>
                <span className="text-sm font-medium">{vote.kidName}</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {vote.vote === 'love_it' ? 'Love it!' : vote.vote === 'okay' ? "It's okay" : 'No way'}
              </Badge>
            </div>
          ))}
        </div>

        {/* Missing votes */}
        {voteSummary.totalVotes < kids.length && (
          <div className="text-xs text-muted-foreground">
            {kids.length - voteSummary.totalVotes} {kids.length - voteSummary.totalVotes === 1 ? 'child hasn\'t' : 'children haven\'t'} voted yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
