import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { TELEGRAM_API } from 'src/constants';
import axios from 'axios';
import { execFile } from 'child_process';

const execAsync = promisify(exec);

@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);
  private readonly botToken: string;
  private readonly whisperPath: string;
  private readonly modelPath: string;

  constructor(private configService: ConfigService) {
    this.botToken = this.getRequiredConfig('TELEGRAM_BOT_TOKEN');
    this.whisperPath = this.getRequiredConfig('WHISPER_PATH');
    this.modelPath = this.getRequiredConfig('WHISPER_MODEL');
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  async transcribeVoice(filePath: string): Promise<string> {
    const fileUrl = `${TELEGRAM_API}/file/bot${this.botToken}/${filePath}`;
    Logger.log(`fileURL: ${fileUrl}`);
    const fileResponse = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
    });

    const audioBuffer = Buffer.from(fileResponse.data);

    const tempDir = '/tmp';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      Logger.log(`Directory created: ${tempDir}`);
    }

    const fileName = path.basename(filePath);
    const inputPath = path.join(tempDir, `input_${Date.now()}_${fileName}`);
    const outputPath = path.join(tempDir, `output_${Date.now()}.wav`);

    try {
      Logger.log('Сохраняем временный файл');
      fs.writeFileSync(inputPath, audioBuffer);

      //Logger.log('Конвертируем в WAV формат (16kHz, mono)');
      //await this.convertAudio(inputPath, outputPath);

      Logger.log('Выполняем транскрипцию');

      return new Promise((resolve, reject) => {
        execFile(
          `${path.join(this.whisperPath, 'whisper-cli.exe')}`,
          ['-m', this.modelPath, '-f', 'sample/sample.wav' /*outputPath*/],
          (err, stdout, stderr) => {
            if (err) {
              Logger.error(err);
              return reject(err);
            }
            Logger.error(stderr);
            Logger.log(stdout);
            resolve(stdout);
          },
        );
      });
    } catch (error) {
      this.logger.error(`Transcription failed: ${error.message}`);
      throw new Error(`Transcription failed: ${error.message}`);
    } finally {
      // Очищаем временные файлы
      //this.cleanupFiles([inputPath, outputPath]);
    }
  }
}
