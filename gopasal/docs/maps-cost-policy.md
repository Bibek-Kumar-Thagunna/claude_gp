# GoPasal web map strategy

Verified against the providers' published pages on 19 September 2026. This is a usage plan, **not a promise of unlimited free maps**. Review the current pricing and terms before launch.

## Provider split

- `MAP_PROVIDER=baato` is the recommended Nepal production configuration. The API uses its server-only key for place suggestions, place details, reverse lookup and road routes. The customer and rider web apps load a separately origin-restricted browser key for MapLibre tiles. A live rider moves from GoPasal's own realtime feed; GPS pings do **not** request new routes.
- Optionally set `MAP_PIN_PROVIDER=google` and `MAP_PIN_BROWSER_TOKEN=<browser-key>` on the **API** to use Google Places Autocomplete and a Google map only in the customer address picker. Set `MAP_PIN_PROVIDER=google` in the **customer web** deployment too so its Content Security Policy permits Google's required hosts. Restrict the browser key to exact web origins and only the Maps JavaScript and Places APIs. Google search data is shown on the Google map, never overlaid on Baato tiles. Tracking remains Baato/MapLibre.
- With no map keys, `MAP_PROVIDER=osm` remains a local, explicitly degraded configuration. Its public demo style is rejected for a deployed environment. A real production tile source is required even if Google is not used.

## Where requests occur

- Shop discovery, delivery radius/zone, delivery fee and nearby distance run on our own PostGIS/geometry code. Opening a shop does **not** call a routing API; the displayed time is an approximate local estimate, flagged `etaDegraded`.
- Saved-address selection, repeat checkout and moving a live rider marker use our own data; they do **not** call a place/route API. Address picker maps load only when the customer asks to adjust a pin. Baato text search begins after three characters and is debounced; selecting a suggestion resolves only that place.
- When an order is actually en route, the API may request a Baato road route between its fixed shop and destination pins. Those requests are cached for 12 hours so polling is normally a cache hit; no rider position enters the route key. Browser tiles still consume provider capacity whenever a map is loaded.
- Google Maps JavaScript/Places is downloaded only when the address picker opens under the optional Google configuration. The widget handles session tokens; do not claim an autocomplete session is automatically free. Customers must confirm or move the final pin and provide a complete written delivery address.

## Costs, quotas and deployment rules

- [Baato pricing](https://baato.io/pricing) currently advertises **5,000 credits per month** on its free plan across APIs. Its pricing page does not publish a universal per-call credit weight. Do not convert that figure into an asserted number of free map loads or routes. Confirm caching and commercial-use terms with Baato before relying on a particular volume.
- `BAATO_SERVER_MONTHLY_LIMIT` defaults to 1,200 uncached server requests per UTC month and is enforced across replicas in Redis. When reached, routing degrades to an approximate straight-line estimate and address search asks for a manual pin. This is only a safety allowance, **not** a complete spend cap: browser tile requests also consume Baato capacity and are not counted by GoPasal's server counter. Monitor the Baato dashboard and set vendor-side restrictions if available.
- [Google's current pricing](https://developers.google.com/maps/billing-and-pricing/pricing) uses per-SKU free monthly thresholds, not the old $200 monthly credit. Dynamic Maps, Places Autocomplete Requests and Place Details Essentials each list 10,000 free events/month, subject to how sessions and requested fields are billed. A Google Cloud billing-enabled project is required; it may require payment details. A budget alert is **not** a hard spend cap. Set restrictive [API quotas](https://developers.google.com/maps/billing-and-pricing/manage-costs) and billing alerts, monitor each SKU, and be prepared for Google to stop working at the chosen quota. There is no honest way to guarantee free, unlimited Google usage simply by changing GoPasal code.
- Do not store Google place names/addresses as a reusable mapping dataset. Follow [Google Places display and storage policies](https://developers.google.com/maps/documentation/places/web-service/policies); the place ID is an explicit storage exception, but other content has restrictions. GoPasal stores customer-confirmed delivery instructions and their selected pin as order/account data, not a Google search index. Have counsel review this cross-provider workflow before launch.
- Do not put server Baato tokens into client env vars. The browser Baato token and Google key are public by design and must have vendor-side origin/API restrictions. The `/discovery/map-config` response is public; never return a private token there.

## Launch check

With real keys, verify in a staging browser: Baato style and attribution, Google Places search and pin selection (if enabled), CSP, saved-address reuse without a provider call, moving-rider updates without rerouting, quota-exhaustion fallback, and monthly provider usage dashboards. Neither vendor flow can be fully end-to-end tested without its own key and account.
