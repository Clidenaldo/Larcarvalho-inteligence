'use client';

import type { AiContextType, AiPromptId } from '@larcarvalho/shared';
import { Sparkles } from 'lucide-react';

import type { AiOpenDetail } from './ai-copilot';
import { Button } from './ui/button';

export function AiAnalyzeButton({
  contextId,
  contextType,
  label,
  message,
  promptId,
  resultIds,
}: {
  readonly contextId?: string;
  readonly contextType: AiContextType;
  readonly label: string;
  readonly message: string;
  readonly promptId: AiPromptId;
  readonly resultIds?: readonly string[];
}) {
  return (
    <Button
      onClick={() => {
        const detail: AiOpenDetail = {
          contextType,
          message,
          promptId,
          ...(contextId ? { contextId } : {}),
          ...(resultIds ? { resultIds: [...resultIds] } : {}),
        };
        window.dispatchEvent(
          new CustomEvent<AiOpenDetail>('larcarvalho:ai-open', { detail }),
        );
      }}
      type="button"
      variant="outline"
    >
      <Sparkles aria-hidden="true" className="h-4 w-4" />
      {label}
    </Button>
  );
}
