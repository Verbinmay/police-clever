import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor,
} from "@nestjs/common";
import { nanoid } from "nanoid";
import type { Observable } from "rxjs";
import { RequestContextService } from "./AppRequestContext";

@Injectable()
export class ContextInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const request = context.switchToHttp().getRequest();

		/**
		 * Setting an ID in the global context for each request.
		 * This ID can be used as correlation id shown in logs
		 */
		const requestId: string = request?.body?.requestId ?? nanoid(6);
		RequestContextService.setRequestId(requestId);

		return next.handle().pipe();
	}
}
