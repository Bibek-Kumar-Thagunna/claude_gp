import { Global, Module } from '@nestjs/common';
import { mapProviderFactory } from './map.provider';
import { paymentProvidersFactory } from './payment.provider';
import { pushProviderFactory } from './push.provider';
import { storageProviderFactory } from './storage.provider';
import { supportAssistantProviderFactory } from './support-assistant.provider';
import { malwareScannerFactory } from './malware-scanner.provider';

/**
 * All external-service abstractions in one global module. Every dependency
 * (maps, payments, push, storage) is resolved behind a DI token and selected by
 * env, so switching a vendor never touches business code or the frontends.
 */
@Global()
@Module({
  providers: [
    mapProviderFactory,
    paymentProvidersFactory,
    pushProviderFactory,
    storageProviderFactory,
    supportAssistantProviderFactory,
    malwareScannerFactory,
  ],
  exports: [mapProviderFactory, paymentProvidersFactory, pushProviderFactory, storageProviderFactory, supportAssistantProviderFactory, malwareScannerFactory],
})
export class ProvidersModule {}
