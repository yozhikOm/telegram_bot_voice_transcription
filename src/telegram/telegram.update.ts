import { Ctx, InjectBot, On, Start, Update } from '@grammyjs/nestjs'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Api, Bot, Context } from 'grammy'
//import { AIService } from '../services/ai.service'
import { SpeechService } from '../services/speech.service'

@Update() // Этот декоратор указывает, что класс слушает события от Telegram
@Injectable()
export class TelegramUpdate {
	private readonly botToken: string

	constructor(
		@InjectBot() private readonly bot: Bot<Context>, // Внедрение Telegram-бота
		private readonly speechService: SpeechService, // Сервис для расшифровки речи
		//private readonly aiService: AIService, // Сервис для генерации тайм-кодов
		private readonly configService: ConfigService
	) {
		this.botToken = this.getRequiredConfig('TELEGRAM_BOT_TOKEN')
	}

    private getRequiredConfig(key: string): string {
		const value = this.configService.get<string>(key);
		if (!value) {
			throw new Error(`Missing required environment variable: ${key}`);
		}
		return value;
	}

	@Start() // Обрабатывает команду /start
	async onStart(@Ctx() ctx: Context): Promise<void> {
		await ctx.reply(
			'👋 Привет! Отправь мне голосовое сообщение, и я расставлю тайм-коды.'
		)
	}

	@On('message:voice') // Обработка голосовых сообщений
	async onVoiceMessage(@Ctx() ctx: Context): Promise<void> {
		let progressMessageId: number | undefined
		let interval: NodeJS.Timeout | undefined
		let percent = 10 // Начальный процент прогресса

		try {
			const voice = ctx.msg!.voice
			const duration = voice!.duration

			// Получаем путь к файлу голосового сообщения
			const file = await ctx.getFile()

			// Показываем длительность голосового
			await ctx.reply(`🎤 Длина голосового сообщения: ${duration} сек.`)

			// Отправляем первое сообщение с прогрессом
			const progressMsg = await ctx.reply(this.renderProgress(percent))
			progressMessageId = progressMsg.message_id

			// ⏱ Эмулируем "оживший" прогресс — обновляем каждые 2 секунды
			interval = setInterval(
				async () => {
					if (percent < 90) {
						percent += 5
						await this.updateProgress(
							ctx.api,
							ctx.chat!.id,
							progressMessageId!,
							percent
						)
					}
				},
				duration > 300 ? 3000 : 2000
			)

			// Расшифровываем речь с помощью Whisper
			const transcription = await this.speechService.transcribeVoice(
				file.file_path!
			)
            Logger.log('voice transcription:', transcription)
			// Отправляем текст в OpenAI и получаем тайм-коды + стоимость
			// const { timestamps, cost } = await this.aiService.generateTimestamps(
			// 	transcription,
			// 	duration
			// )

			// // Останавливаем обновление прогресса
			// clearInterval(interval)
			// await this.updateProgress(ctx.api, ctx.chat.id, progressMessageId, 100)

			// // Отправляем результат
			// await ctx.reply(
			// 	`⏳ Тайм-коды:\n\n${timestamps}\n\n<i>🤖 Таймы генерирует нейросеть, через наш бот</i>`,
			// 	{
			// 		parse_mode: 'HTML'
			// 	}
			// )
			// await ctx.reply(cost)
		} catch (error) {
			clearInterval(interval) // Останавливаем прогресс даже при ошибке
            console.error('Ошибка при обработке голосового:', error.message)
            console.error('error.status', error.status)
            console.error('error.headers', error.response.headers);
            console.error('error.data', JSON.stringify(error.response.data))
			await ctx.reply('⚠️ Ошибка при обработке голосового сообщения.')
		}
	}

	// Обновление прогресса (редактирует предыдущее сообщение)
	private async updateProgress(
		api: Api,
		chatId: number,
		messageId: number,
		percent: number
	) {
		await api.editMessageText(chatId, messageId, this.renderProgress(percent))
	}

	// Отрисовка прогресс-бара с заданным процентом
	private renderProgress(percent: number): string {
		const totalBlocks = 10 // Всего 10 ячеек в прогресс-баре
		const blockChar = '▒' // Символ, обозначающий "заполненную" ячейку прогресса

		// Вычисляем количество заполненных блоков на шкале
		const filledBlocks = Math.max(1, Math.round((percent / 100) * totalBlocks))

		/**
		 * 👉 Math.round(...) — округляет до ближайшего целого (например, 3.6 → 4)
		 * 👉 (percent / 100) * totalBlocks — переводим процент в количество блоков
		 * 👉 Math.max(1, ...) — гарантируем, что хотя бы 1 блок всегда будет показан (даже при 0%)
		 */

		const emptyBlocks = totalBlocks - filledBlocks // Остальные блоки считаем как "пустые"

		/**
		 * 👉 String.prototype.repeat(n) — повторяет символ n раз
		 * Пример: '▒'.repeat(4) = '▒▒▒▒'
		 * Таким образом формируем заполненную и пустую часть визуального прогресса
		 */

		// Собираем строку вида: 🔄 Прогресс: [▒▒▒▒░░░░░░] 40%
		return `🔄 Прогресс: [${blockChar.repeat(filledBlocks)}${'░'.repeat(emptyBlocks)}] ${percent}%`
	}
}