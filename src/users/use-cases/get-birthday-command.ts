import { format } from '@formkit/tempo';
import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { MessagesRepository } from '../../messages/messages.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { User } from '../users.entity';
import { UsersRepository } from '../users.repository';

export class GetBirthdayCommand {
  constructor() {}
}

@CommandHandler(GetBirthdayCommand)
export class GetBirthdayCase implements ICommandHandler<GetBirthdayCommand> {
  private readonly logger = new Logger(GetBirthdayCase.name);

  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly botRepository: BotRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async execute() {
    try {
      const todayBirthdays: Array<User> = await this.findBirthdayUsers();

      if (todayBirthdays.length === 0) {
        return makerResponse(1);
      }

      const chatIds: string[] = Array.from(
        new Set(todayBirthdays.flatMap((user) => user.chatIds)),
      );

      for (const chatId of chatIds) {
        const threadId = await this.findThreadId(chatId);

        const messageText = this.createTextMessage(todayBirthdays, chatId);
        await this.botRepository.sendMessage(
          Number(chatId),
          messageText,
          threadId,
        );
      }

      return makerResponse(1);
    } catch (e) {
      this.logger.error(e);
      return makerResponse(0);
    }
  }

  private async findBirthdayUsers() {
    const users = await this.usersRepository.findAllUsers();
    const birthdayUsers = users.filter((user) => user.birthdate !== null);
    const todayBirthdays = birthdayUsers.filter((user) => {
      const birthday = user.birthdate as Date;
      const today = new Date();
      return (
        birthday.getDate() === today.getDate() &&
        birthday.getMonth() === today.getMonth()
      );
    });
    return todayBirthdays;
  }

  private async findThreadId(chatId: string) {
    const lastMessage =
      await this.messagesRepository.findLastMessageByChatId(chatId);
    return !lastMessage?.threadId ? 0 : Number(lastMessage.threadId);
  }

  private createTextMessage(todayBirthdays: Array<User>, chatId: string) {
    const birthdayUsersInChat = todayBirthdays.filter((user) =>
      user.chatIds.includes(chatId),
    );

    const messageText = `Сегодня день рождения у: ${birthdayUsersInChat
      .map(
        (user) =>
          `${user.usernameTg} ${format(user.birthdate as Date, 'long')}`,
      )
      .join(', ')}`;
    return messageText;
  }
}
