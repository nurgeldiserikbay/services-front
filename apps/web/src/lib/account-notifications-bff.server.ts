import 'server-only';
import {readAccountWebSession} from './account-web-session.server';
import {fetchAccountNotifications,NotificationTransportUnauthorized}
 from './account-notifications-transport.mjs';

/** Cookie is sealed but backend must recheck revocation on EVERY inbox read. */
export async function getOwnAccountNotifications(cookieValue:string|undefined){
 const session=readAccountWebSession(cookieValue);
 if(!session)throw new NotificationTransportUnauthorized();
 return fetchAccountNotifications({
  baseUrl:process.env.SERVICES_API_BASE_URL??'',
  production:process.env.NODE_ENV==='production',
  accountBearer:session.token,limit:30,
 });
}
