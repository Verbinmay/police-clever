import OpenAI from 'openai';
import { setTimeout } from 'timers/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';

const MAX_RETRIES = 3; // Максимальное количество попыток
const RETRY_DELAY_MS = 500; // Задержка между попытками

@Injectable()
export class AiRepository {
  constructor(
    @Inject('AI_CLIENT')
    private readonly openai: OpenAI,
  ) {}
  private readonly logger = new Logger(AiRepository.name);
  private readonly model = 'deepseek-chat';

  async getRequest(
    systemPrompt: string,
    dialogText: string,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion | null> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: dialogText },
          ],
          temperature: 0.9,
          max_tokens: 1000,
        });
        return response;
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          return null;
        }
        this.logger.error(`Error on attempt ${attempt}: ${error}`);
        await setTimeout(RETRY_DELAY_MS * attempt);
      }
    }
    return null;
  }
}
