import type * as Td from 'tdlib-types';

import { Injectable } from '@nestjs/common';

import { BotRepository } from '../bot/bot.repository';
import { Chat } from '../chats/chat.entity';
import { ChatsRepository } from '../chats/chats.repository';
import { CreateUserDto } from './dto/create-user-dto';
import { MuteInfo } from './interfaces/mute-info.interface';
import { User } from './users.entity';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly botRepository: BotRepository,
    private readonly usersRepository: UsersRepository,
    private readonly chatsRepository: ChatsRepository,
  ) {}
  async findRepliedUserId(
    message: Td.message,
    chatId: number,
  ): Promise<number | null> {
    const repliedMessageId = (message.reply_to as Td.messageReplyToMessage)
      ?.message_id;

    if (!repliedMessageId) {
      return null;
    }

    const replyingMessage: Td.message | null =
      await this.botRepository.getChatMessageById(chatId, repliedMessageId);

    if (!replyingMessage) {
      return null;
    }
    const repliedUserId = (replyingMessage.sender_id as Td.messageSenderUser)
      .user_id;

    return repliedUserId;
  }
  findAddedTextInMessage(message: Td.message): string {
    const text: string = (message.content as Td.messageText).text.text;

    const info = text.split(' ');
    let customTitle = 'товарищ';
    if (info.length >= 2) {
      const [, ...rest] = text.split(' ');
      customTitle = rest.join(' ');
    }
    return customTitle;
  }

  async restoreUserRights(muteInfo: MuteInfo) {
    if (muteInfo.isAdmin) {
      await this.botRepository.setAdmin(
        muteInfo.chatId,
        muteInfo.userId,
        muteInfo.nickname ?? 'лох',
      );
    } else {
      await this.botRepository.setNickname(
        muteInfo.chatId,
        muteInfo.userId,
        muteInfo.nickname ?? 'лох',
      );
    }
    return true;
  }

  async createUser(member: Td.chatMember, chatId: number) {
    const userId: number = (member.member_id as Td.messageSenderUser).user_id;
    let user: User | null = await this.usersRepository.findByUserId(
      userId.toString(),
    );
    const mainInfo: Td.user | null =
      await this.botRepository.getUserById(userId);
    if (!mainInfo) {
      return null;
    }
    const username = mainInfo.usernames?.active_usernames[0] ?? null;
    if (!username) {
      return null;
    }
    if (!user) {
      const userDto: CreateUserDto = {
        idTg: mainInfo.id.toString(),
        usernameTg: username,
        chatIds: [],
      };
      user = User.create(userDto);
    }

    user.name = mainInfo.first_name;
    user.nickname =
      (member.status as Td.chatMemberStatusAdministrator)?.custom_title ?? null;
    user.usernameTg = username;
    if (!user.chatIds.includes(chatId.toString())) {
      user.chatIds.push(chatId.toString());
    }
    const savedUser: User | null = await this.usersRepository.save(user);
    if (!savedUser) {
      return null;
    }
    return savedUser;
  }

  async changeNicknameInUserEntity(
    repliedUserId: number,
    nickname: string | null,
  ): Promise<boolean> {
    const user: User | null = await this.usersRepository.findByUserId(
      repliedUserId.toString(),
    );
    if (user) {
      user.nickname = nickname;
      await this.usersRepository.save(user);
      return true;
    }
    return false;
  }

  async addChatAdmin(chat: Chat, repliedUserId: number) {
    await this.chatsRepository.save({
      ...chat,
      adminsIds: [...chat.adminsIds, String(repliedUserId)],
    });
  }

  async removeChatAdmin(chat: Chat, repliedUserId: number) {
    if (chat.adminsIds.includes(String(repliedUserId))) {
      await this.chatsRepository.save({
        ...chat,
        adminsIds: chat.adminsIds.filter((id) => id !== String(repliedUserId)),
      });
    }
  }

  checkRightsAdminsOrUser(userId: number, chat: Chat, repliedUserId: number) {
    const isSameUser: boolean = userId === repliedUserId;
    const isOwner: boolean = userId.toString() === chat.ownerId;
    const isAdmin: boolean = chat.adminsIds.includes(userId.toString());
    return isSameUser || isOwner || isAdmin;
  }

  checkRightsAdminsOnly(userId: number, chat: Chat) {
    const isOwner: boolean = userId.toString() === chat.ownerId;
    const isAdmin: boolean = chat.adminsIds.includes(userId.toString());
    return isOwner || isAdmin;
  }
}
