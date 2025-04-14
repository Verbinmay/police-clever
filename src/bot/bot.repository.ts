import * as tdl from 'tdl';
import type * as Td from 'tdlib-types';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { cropTextForMessage } from './utils/crop-text-for-message';

@Injectable()
export class BotRepository {
  constructor(@Inject('TDL_CLIENT') private readonly clientTG: tdl.Client) {}
  private readonly logger = new Logger(BotRepository.name);

  async getChatAdministrators(
    chatId: number,
  ): Promise<Array<Td.chatAdministrator>> {
    try {
      const administrators: Td.chatAdministrators = await this.clientTG.invoke({
        _: 'getChatAdministrators',
        chat_id: chatId,
      });
      return administrators.administrators;
    } catch (error) {
      this.logger.error(error);
      return [];
    }
  }

  async getForumTopics(chatId: number): Promise<Td.forumTopics | null> {
    try {
      const response: Td.forumTopics = await this.clientTG.invoke({
        _: 'getForumTopics',
        chat_id: chatId,
        offset_date: 0,
        offset_message_id: 0,
        limit: 100,
      });

      return response;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async getChatMessageById(
    chat_id: number,
    message_id: number,
  ): Promise<Td.message | null> {
    try {
      const message: Td.message = await this.clientTG.invoke({
        _: 'getMessage',
        chat_id,
        message_id,
      });
      return message;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async setNickname(chatId: number, userId: number, customTitle: string) {
    try {
      const rights: Td.chatAdministratorRights = {
        _: 'chatAdministratorRights',
        can_manage_chat: false,
        can_change_info: false,
        can_post_messages: false,
        can_edit_messages: false,
        can_delete_messages: false,
        can_invite_users: true,
        can_restrict_members: false,
        can_manage_topics: false,
        can_promote_members: false,
        can_manage_video_chats: false,
        can_pin_messages: false,
        can_post_stories: false,
        can_edit_stories: false,
        can_delete_stories: false,
        is_anonymous: false,
      };

      const status: Td.chatMemberStatusAdministrator = {
        _: 'chatMemberStatusAdministrator',
        custom_title: customTitle,
        can_be_edited: true,
        rights: rights,
      };

      await this.clientTG.invoke({
        _: 'setChatMemberStatus',
        chat_id: chatId,
        member_id: {
          _: 'messageSenderUser',
          user_id: userId,
        },
        status: status,
      });

      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }
  async setAdmin(chatId: number, userId: number, customTitle: string) {
    try {
      const rights: Td.chatAdministratorRights = {
        _: 'chatAdministratorRights',
        can_manage_chat: true,
        can_change_info: true,
        can_post_messages: true,
        can_edit_messages: true,
        can_delete_messages: true,
        can_invite_users: true,
        can_restrict_members: true,
        can_manage_topics: true,
        can_promote_members: false,
        can_manage_video_chats: true,
        can_pin_messages: true,
        can_post_stories: true,
        can_edit_stories: true,
        can_delete_stories: true,
        is_anonymous: false,
      };

      const status: Td.chatMemberStatusAdministrator = {
        _: 'chatMemberStatusAdministrator',
        custom_title: customTitle,
        can_be_edited: true,
        rights: rights,
      };

      await this.clientTG.invoke({
        _: 'setChatMemberStatus',
        chat_id: chatId,
        member_id: {
          _: 'messageSenderUser',
          user_id: userId,
        },
        status: status,
      });

      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }
  async setNormis(chatId: number, userId: number) {
    try {
      const status: Td.chatMemberStatusMember = {
        _: 'chatMemberStatusMember',
        member_until_date: 0,
      };

      await this.clientTG.invoke({
        _: 'setChatMemberStatus',
        chat_id: chatId,
        member_id: {
          _: 'messageSenderUser',
          user_id: userId,
        },
        status: status,
      });

      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  async sendMessage(
    chat_id: number,
    text: string,
    message_thread_id?: number,
  ): Promise<Array<Td.message> | null> {
    try {
      const texts: Array<string> = cropTextForMessage(text);

      const messages: Array<Td.message> = [];
      for (const text of texts) {
        messages.push(
          await this.clientTG.invoke({
            _: 'sendMessage',
            chat_id,
            input_message_content: {
              _: 'inputMessageText',
              text: {
                _: 'formattedText',
                text,
              },
            },
            message_thread_id,
          }),
        );
      }
      return messages;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async getUserById(userId: number): Promise<Td.user | null> {
    try {
      const userFullInfo: Td.user = await this.clientTG.invoke({
        _: 'getUser',
        user_id: userId,
      });

      return userFullInfo;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async muteUser(chatId: number, userId: number, timeInMinutes: number) {
    try {
      const rights: Td.chatMemberStatusRestricted = {
        _: 'chatMemberStatusRestricted',
        is_member: true,
        restricted_until_date:
          Math.floor(Date.now() / 1000) + timeInMinutes * 60,
        permissions: {
          _: 'chatPermissions',
          can_send_basic_messages: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_create_topics: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
          can_add_link_previews: false,
        },
      };

      await this.clientTG.invoke({
        _: 'setChatMemberStatus',
        chat_id: chatId,
        member_id: {
          _: 'messageSenderUser',
          user_id: userId,
        },
        status: rights,
      });

      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }
  async unmuteUser(chatId: number, userId: number) {
    try {
      const rights: Td.chatMemberStatusRestricted = {
        _: 'chatMemberStatusRestricted',
        is_member: true,
        restricted_until_date: 0,
        permissions: {
          _: 'chatPermissions',
          can_send_basic_messages: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_create_topics: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_change_info: true,
          can_invite_users: true,
          can_pin_messages: true,
          can_add_link_previews: true,
        },
      };

      await this.clientTG.invoke({
        _: 'setChatMemberStatus',
        chat_id: chatId,
        member_id: {
          _: 'messageSenderUser',
          user_id: userId,
        },
        status: rights,
      });

      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  async findAllMembers(chatId: number): Promise<Array<Td.chatMember>> {
    try {
      const members: Td.chatMembers = await this.clientTG.invoke({
        _: 'searchChatMembers',
        limit: 200,
        chat_id: chatId,
        query: '',
      });
      return members.members;
    } catch (error) {
      this.logger.error(error);
      return [];
    }
  }
}
