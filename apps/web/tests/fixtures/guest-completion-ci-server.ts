/**
 * CI-ONLY FILE: copied by frontend workflow into services-back/test, loaded by
 * tsx and never shipped in an application build. Production's disabled OTP
 * adapter is never changed by this test fixture.
 */
import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {writeFileSync} from 'node:fs';
import {AppModule} from '../src/modules/app.module.js';
import {OtpDeliveryService} from
 '../src/modules/guest-requests/otp-delivery.service.js';
import type {OtpDeliveryPort} from
 '../src/modules/guest-requests/otp-delivery.port.js';

if(process.env.CI!=='true'||process.env.SERVICES_TEST_OTP_DELIVERY!=='fixture'||
 !process.env.RUNNER_TEMP||!process.env.DATABASE_URL||
 !process.env.SERVICES_GUEST_COMPLETION_CODE_FILE){
 throw new Error('isolated CI-only server not authorized');
}
const app=await NestFactory.create(AppModule,{logger:false});
const otp=app.get(OtpDeliveryService) as OtpDeliveryService&{
 provider:OtpDeliveryPort;
};
if(!Object.prototype.hasOwnProperty.call(otp,'provider'))
 throw new Error('unexpected OTP service: cannot inject CI adapter');
// Isolated runtime instance only; the default production module still fails
// closed. The code is written 0600 to a runner-only path and never logged.
otp.provider={
 async deliverOtp(message){
  if(message.purpose!=='COMPLETE_REQUEST')
   throw new Error('test server only permits completion OTP');
  writeFileSync(process.env.SERVICES_GUEST_COMPLETION_CODE_FILE!,
   JSON.stringify({code:message.code,channel:message.channel,
    destination:message.destination,purpose:message.purpose}),
   {mode:0o600,flag:'w'});
  return {accepted:true,providerRef:'ci_test_adapter_01'};
 }
};
app.setGlobalPrefix('v1');
await app.listen(3103,'127.0.0.1');
