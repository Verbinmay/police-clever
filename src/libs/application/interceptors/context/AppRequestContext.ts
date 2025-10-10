/** biome-ignore-all lint/complexity/noStaticOnlyClass: <-> */
import { RequestContext } from "nestjs-request-context";
import type { EntityManager } from "typeorm";

/**
 * Setting some isolated context for each request.
 */

export class AppRequestContext extends RequestContext {
	requestId: string;
	transactionManager?: EntityManager; // For global transactions
}

export class RequestContextService {
	static getContext(): AppRequestContext {
		const ctx: AppRequestContext = RequestContext.currentContext.req;
		return ctx;
	}

	static setRequestId(id: string): void {
		const ctx = RequestContextService.getContext();
		ctx.requestId = id;
	}

	static getRequestId(): string {
		return RequestContextService.getContext().requestId;
	}

	static getTransactionManager(): EntityManager | undefined {
		const ctx = RequestContextService.getContext();
		return ctx.transactionManager;
	}

	static setTransactionConnection(transactionManager?: EntityManager): void {
		const ctx = RequestContextService.getContext();
		ctx.transactionManager = transactionManager;
	}

	static cleanTransactionConnection(): void {
		const ctx = RequestContextService.getContext();
		ctx.transactionManager = undefined;
	}
}
