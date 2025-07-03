import { Card } from "@/components/card/Card";
import { Robot } from "@phosphor-icons/react";

type EmptyChatProps = {
  message?: string;
};

export function EmptyChat({
  message,
}: EmptyChatProps) {
  // LLMDJ-specific welcome message if none provided
  const defaultMessage = "Ready to discover your next favorite song? Try asking me to create a playlist, find similar artists, or explore new music based on your mood!";

  return (
    <div className="h-full flex items-center justify-center">
      <Card className="p-6 max-w-md mx-auto bg-neutral-100 dark:bg-neutral-900">
        <div className="text-center space-y-4">
          <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex">
            <Robot size={24} />
          </div>
          <h3 className="font-semibold text-xl">🎵 LLMDJ is Ready</h3>
          <p className="text-muted-foreground text-base leading-relaxed">
            {message || defaultMessage}
          </p>
          <div className="text-sm text-neutral-500 dark:text-neutral-400 space-y-1 pt-2">
            <p className="font-medium">Try asking:</p>
            <div className="text-xs space-y-1">
              <p>"Create a workout playlist with high-energy rock"</p>
              <p>"Find artists similar to Radiohead"</p>
              <p>"What's that song about time and memories?"</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
