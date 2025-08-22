import { Injectable, Logger } from '@nestjs/common';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { TELEGRAM_API } from 'src/constants';
import axios from 'axios';

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

  private async checkFFmpeg(): Promise<void> {
    try {
      await execAsync('ffmpeg -version');
      console.log('FFmpeg доступен');
    } catch (error) {
      console.error('FFmpeg не установлен или не доступен в PATH');
      throw error;
    }
  }

  async transcribeVoice(filePath: string): Promise<string> {
    const fileUrl = `${TELEGRAM_API}/file/bot${this.botToken}/${filePath}`;
    const fileName = path.basename(filePath);

    const fileResponse = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
    });

    const audioBuffer = Buffer.from(fileResponse.data);

    Logger.log('Создаем временную папку, если не существует');
    const tempDir = '/tmp';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      Logger.log(`Папка создана: ${tempDir}`);
    }

    const inputPath = path.join(tempDir, `input_${Date.now()}_${fileName}`);
    const outputPath = path.join(tempDir, `output_${Date.now()}.wav`);

    try {
      Logger.log('Сохраняем временный файл');
      fs.writeFileSync(inputPath, audioBuffer);

      await this.checkFFmpeg();

      Logger.log('Конвертируем в WAV формат (16kHz, mono)');
      await this.convertAudio(inputPath, outputPath);

      Logger.log('Выполняем транскрипцию');

      return new Promise((resolve, reject) => {
        execFile(
          `${path.join(this.whisperPath, 'whisper-cli.exe')}`,
          [
            '-m', this.modelPath,
            '-f', outputPath,
            '-l', 'auto'  // Автоматическое определение языка
          ],
          (err, stdout, stderr) => {
            if (err) {
              Logger.error(err);
              return reject(err);
            }
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

  private async convertAudio(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    const command = `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le -y "${outputPath}"`;
    await execAsync(command);
  }
  // private async convertAudio(
  //   inputPath: string,
  //   outputPath: string,
  // ): Promise<void> {
  //   return new Promise((resolve, reject) => {
  //     console.log('Запуск FFmpeg...');

  //     const ffmpeg = spawn('ffmpeg', [
  //       '-i',
  //       inputPath,
  //       '-ar',
  //       '16000',
  //       '-ac',
  //       '1',
  //       '-c:a',
  //       'pcm_s16le',
  //       '-y',
  //       outputPath,
  //     ]);

  //     // Логируем все выводы
  //     ffmpeg.stdout.on('data', (data) => {
  //       console.log('FFmpeg stdout:', data.toString());
  //     });

  //     ffmpeg.stderr.on('data', (data) => {
  //       console.log('FFmpeg stderr:', data.toString());
  //     });

  //     ffmpeg.on('close', (code) => {
  //       console.log(`FFmpeg завершился с кодом: ${code}`);
  //       if (code === 0) {
  //         resolve();
  //       } else {
  //         reject(new Error(`FFmpeg exited with code ${code}`));
  //       }
  //     });

  //     ffmpeg.on('error', (error) => {
  //       console.error('Ошибка запуска FFmpeg:', error);
  //       reject(error);
  //     });
  //   });
  // }
}
