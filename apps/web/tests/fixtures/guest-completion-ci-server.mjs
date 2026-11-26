/**
 * CI-ONLY FILE: copied by frontend workflow into services-back/test, loaded by
 * plain Node and never shipped in an application build. Production's disabled OTP
 * adapter is never changed by this test fixture.
 */
import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {writeFileSync} from 'node:fs';
import {AppModule} from '../dist/modules/app.module.js';
import {OtpDeliveryService} from
 '../dist/modules/guest-requests/otp-delivery.service.js';
import {GuestOtpDispatchService} from
 '../dist/modules/guest-requests/guest-otp-dispatch.service.js';

if(process.env.CI!=='true'||process.env.SERVICES_TEST_OTP_DELIVERY!=='fixture'||
 !process.env.RUNNER_TEMP||!process.env.DATABASE_URL||
 !process.env.SERVICES_GUEST_COMPLETION_CODE_FILE){
 throw new Error('isolated CI-only server not authorized');
}
const app=await NestFactory.create(AppModule,{logger:false});
const otp=app.get(OtpDeliveryService);
if(!Object.prototype.hasOwnProperty.call(otp,'provider'))
 throw new Error('unexpected OTP service: cannot inject CI adapter');
// Isolated runtime instance only; the default production module still fails
// closed. The code is written 0600 to a runner-only path and never logged.
otp.provider={
 async deliverOtp(message){
  if(!['COMPLETE_REQUEST','MANAGE_SCHEDULE'].includes(message.purpose))
   throw new Error('test server only permits completion or schedule OTP');
  writeFileSync(process.env.SERVICES_GUEST_COMPLETION_CODE_FILE,
   JSON.stringify({code:message.code,channel:message.channel,
    destination:message.destination,purpose:message.purpose}),
   {mode:0o600,flag:'w'});
  return {accepted:true,providerRef:'ci_test_adapter_01'};
 }
};
// Emit only error class and SQLSTATE/constraint names from the disposable
// isolated test server. Do not log request, identity, contact, OTP or bearer.
const dispatcher=app.get(GuestOtpDispatchService);
const originalDispatch=dispatcher.dispatchCompleteRequest.bind(dispatcher);
dispatcher.dispatchCompleteRequest=async(...args)=>{
 try{return await originalDispatch(...args);}
 catch(error){
  const event={name:error instanceof Error?error.name:'Unknown',
   code:typeof error?.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)
    ?error.code:null,
   constraint:typeof error?.constraint==='string'&&
    /^[a-z0-9_]{1,90}$/.test(error.constraint)?error.constraint:null,
   // Only source path/line location, never exception text or parameters.
   locations:typeof error?.stack==='string'?
    error.stack.split(String.fromCharCode(10)).slice(1,4).map(frame=>
     frame.trim().split('(').at(-1).split('/').slice(-3)
      .join('/').slice(0,120)) : [],
  };
  console.error('CI_GUEST_COMPLETION_DISPATCH_ERROR',JSON.stringify(event));
  throw error;
 }
};
// CI-only sanitized diagnostics for unexpected schedule exceptions.
const {ScheduleProposalHttpService}=await import('../dist/modules/requests/schedule-proposal-http.service.js');
const {ScheduleProposalRejected}=await import('../dist/modules/requests/schedule-proposal.transaction.js');
const schedule=app.get(ScheduleProposalHttpService);
const originalMutate=schedule.mutate.bind(schedule);
schedule.mutate=async(...args)=>{
 try{return await originalMutate(...args);}
 catch(error){
  console.error('CI_GUEST_SCHEDULE_ERROR',JSON.stringify({
   name:error instanceof Error?error.name:'Unknown',
   code:typeof error?.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:null,
   reason:['conflict','forbidden','not_found'].includes(error?.reason)?error.reason:null,
   recognizedDomainError:error instanceof ScheduleProposalRejected,
   constraint:typeof error?.constraint==='string'&&/^[a-z0-9_]{1,90}$/.test(error.constraint)?error.constraint:null,
   locations:typeof error?.stack==='string'?error.stack.split('\n').slice(1,5).map(frame=>frame.trim().split('(').at(-1).split('/').slice(-3).join('/').slice(0,120)):[],
  }));
  throw error;
 }
};
app.setGlobalPrefix('v1');
await app.listen(3103,'127.0.0.1');
