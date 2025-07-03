import type { FormEvent, ReactNode } from "react";
import type { AgentMode } from "../../agent/AppAgent";
import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";

type ChatContainerProps = {
  theme: "dark" | "light";
  showDebug: boolean;
  agentMode: AgentMode;
  inputValue: string;
  isLoading: boolean;
  pendingConfirmation: boolean;
  children: ReactNode;
  suggestedActionsComponent?: ReactNode;
  onToggleTheme: () => void;
  onToggleDebug: () => void;
  onChangeMode: (mode: AgentMode) => void;
  onClearHistory: () => void;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onInputSubmit: (e: FormEvent) => void;
};

export function ChatContainer({
  theme,
  showDebug,
  agentMode,
  inputValue,
  isLoading,
  pendingConfirmation,
  children,
  suggestedActionsComponent,
  onToggleTheme,
  onToggleDebug,
  onChangeMode,
  onClearHistory,
  onInputChange,
  onInputSubmit,
}: ChatContainerProps) {
  return (
    <div className="h-full w-full md:w-3/5 lg:w-3/5 flex-shrink-0 flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
      {/* Header */}
      <ChatHeader
        theme={theme}
        showDebug={showDebug}
        agentMode={agentMode}
        onToggleTheme={onToggleTheme}
        onToggleDebug={onToggleDebug}
        onChangeMode={onChangeMode}
        onClearHistory={onClearHistory}
      />

      {/* Messages */}
      <MessageList>{children}</MessageList>

      {/* Suggested actions */}
      {suggestedActionsComponent}

      {/* Input */}
      <ChatInput
        value={inputValue}
        onChange={onInputChange}
        onSubmit={onInputSubmit}
        isLoading={isLoading}
        pendingConfirmation={pendingConfirmation}
      />
    </div>
  );
}
