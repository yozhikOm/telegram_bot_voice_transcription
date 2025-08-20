import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConfigHelperService {
  constructor(private readonly configService: ConfigService) {}

  getRequired(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  getOptional(key: string, defaultValue: string = ''): string {
    return this.configService.get<string>(key) || defaultValue;
  }
}