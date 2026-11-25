import {NextRequest} from 'next/server';
import {handleAccountSchedule} from '@/lib/account-schedule-route.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function POST(request:NextRequest,context:{params:Promise<{id:string;proposalId:string}>}){
 const {id,proposalId}=await context.params;
 return handleAccountSchedule(request,id,'confirm',proposalId);
}
