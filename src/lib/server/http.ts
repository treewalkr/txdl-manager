import { json } from '@sveltejs/kit';
import { PathEscapeError, UnmappedPathError } from './paths';
import { TransmissionError } from './transmission';

export function fail(e: unknown) {
	const status =
		e instanceof TransmissionError
			? e.status
			: e instanceof PathEscapeError || e instanceof UnmappedPathError
				? 400
				: 500;
	const message = e instanceof Error ? e.message : String(e);
	return json({ error: message }, { status: status ?? 500 });
}
