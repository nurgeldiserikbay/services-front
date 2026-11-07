import type {SellerInboxEntry} from '../components/SellerInboxList';
export type SellerInboxPage=Readonly<{
  items:SellerInboxEntry[];
  next_cursor:string|null;
}>;
/** Strict allowlisted backend read-model projection. Throws on invalid input. */
export function parseSellerInboxPage(value:unknown):SellerInboxPage;
/** Keep the newest version for each request ID. */
export function mergeSellerInboxPages(
  previous:readonly SellerInboxEntry[],
  incoming:readonly SellerInboxEntry[],
):SellerInboxEntry[];
