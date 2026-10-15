import { Router as ExpressRouter, type NextFunction, type Request, type Response } from "express";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

export type Router = ReturnType<typeof ExpressRouter>;

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

function forwardAsyncErrors(handler: unknown): unknown {
	// 4 аргумента — это error-middleware, его не трогаем.
	if (typeof handler !== "function" || handler.length >= 4) return handler;
	return (req: Request, res: Response, next: NextFunction) => {
		try {
			const result = (handler as Handler)(req, res, next);
			if (result instanceof Promise) result.catch(next);
		} catch (err) {
			next(err);
		}
	};
}

/**
 * express.Router, но исключение из async-хендлера уходит в next(err), а не
 * в никуда: Express 4 сам async не понимает — запрос вис до таймаута
 * браузера, а в логах был только безликий "Unhandled rejection" без маршрута.
 * Дальше его ловит общий error-middleware в mount.ts. Порт 1:1 из bots-platform.
 */
export function Router(): Router {
	const router = ExpressRouter();
	for (const method of METHODS) {
		const original = router[method].bind(router) as (...args: unknown[]) => unknown;
		(router as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => original(...args.map(forwardAsyncErrors));
	}
	return router;
}
