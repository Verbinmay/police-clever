export class CreateMessageDto {
  idTg: string;
  text: string;
  chatId: string;
  threadId: string | null;
}
