function getUpstreamUrl(request: Request) {
	return new URL(
		"/api/auth/.well-known/oauth-authorization-server",
		request.url,
	);
}

export async function GET(request: Request) {
	const upstream = await fetch(getUpstreamUrl(request), {
		headers: {
			accept: "application/json",
		},
		cache: "no-store",
	});

	return new Response(await upstream.text(), {
		status: upstream.status,
		headers: {
			"Content-Type":
				upstream.headers.get("content-type") ??
				"application/json; charset=utf-8",
			"Cache-Control":
				upstream.headers.get("cache-control") ??
				"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
		},
	});
}
