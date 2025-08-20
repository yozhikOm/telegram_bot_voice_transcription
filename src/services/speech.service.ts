import { Injectable } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import { OPENAI_API, TELEGRAM_API } from '../constants';
import { ConfigHelperService } from './сonfig-helper.service';

@Injectable()
export class SpeechService {
  private readonly botToken: string;
  private readonly openaiApiKey: string;

  constructor(private readonly configHelper: ConfigHelperService) {
    this.botToken = this.configHelper.getRequired('TELEGRAM_BOT_TOKEN');
    this.openaiApiKey = this.configHelper.getRequired('OPENAI_API_KEY');
  }
  //   constructor(private readonly configService: ConfigService) {
  //     this.botToken = this.getRequiredConfig('TELEGRAM_BOT_TOKEN');
  //     this.openaiApiKey = this.getRequiredConfig('OPENAI_API_KEY');
  //   }

  //   private getRequiredConfig(key: string): string {
  //     const value = this.configService.get<string>(key);
  //     if (!value) {
  //       throw new Error(`Missing required environment variable: ${key}`);
  //     }
  //     return value;
  //   }

  async transcribeVoice(filePath: string): Promise<string> {
    const fileUrl = `${TELEGRAM_API}/file/bot${this.botToken}/${filePath}`;
    const fileResponse = await axios.get(fileUrl, { responseType: 'stream' });

    const formData = new FormData();
    formData.append('file', fileResponse.data, { filename: 'audio.ogg' });
    formData.append('model', 'whisper-1');

    const response = await axios.post<{ text: string }>(
      `${OPENAI_API}/audio/transcriptions`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          ...formData.getHeaders(),
        },
      },
    );

    return response.data.text;
  }
}
