import {
    OperationBroker,
    OperationEvent,
    OperationType,
    OperationEventResponse,
    AggregateOperationEventResponse,
} from 'fhir-works-on-aws-interface';
import { isUndefined, has } from 'lodash';

export default class Broker implements OperationBroker {
    private typeToSubscribers: Map<OperationType, { (event: OperationEvent): Promise<OperationEventResponse> }[]>;

    constructor(
        typeToSubscribers: Map<OperationType, { (event: OperationEvent): Promise<OperationEventResponse> }[]> = new Map<
            OperationType,
            { (event: OperationEvent): Promise<OperationEventResponse> }[]
        >(),
    ) {
        this.typeToSubscribers = typeToSubscribers;
    }

    async publish(event: OperationEvent): Promise<AggregateOperationEventResponse> {
        let success: boolean = true;
        const responses: OperationEventResponse[] = [];
        const errors: Error[] = [];
        if (this.typeToSubscribers.has(event.operation)) {
            const subscribers = this.typeToSubscribers.get(event.operation);
            if (!isUndefined(subscribers) && subscribers.length > 0) {
                const subscriberPromises = subscribers.map((subscriber) => {
                    try {
                        return subscriber(event);
                    } catch (err) {
                        return Promise.reject(err);
                    }
                });

                try {
                    const results = await Promise.allSettled(subscriberPromises);
                    results.forEach((result) => {
                        if (result.status === 'fulfilled') {
                            responses.push(result.value);
                            success = success && result.value.success;
                            if (!isUndefined(result.value.errors)) {
                                errors.push(...result.value.errors);
                            }
                        } else if (result.status === 'rejected') {
                            success = false;
                            if (has(result, 'reason')) {
                                errors.push(new Error(result.reason.toString()));
                            }
                        }
                    });
                } catch (e: unknown) {
                    success = false;
                    if (typeof e === 'string') {
                        errors.push(new Error(e));
                    } else if (e instanceof Error) {
                        errors.push(e);
                    }
                }
            }
        }

        return {
            success,
            responses,
            errors,
        };
    }

    subscribe(
        operations: OperationType[] = [],
        subscriber: (event: OperationEvent) => Promise<OperationEventResponse>,
    ): void {
        operations.forEach((operation) => {
            if (!this.typeToSubscribers.has(operation)) {
                this.typeToSubscribers.set(operation, []);
            }

            // ts bumbles the fact that we set the eventName
            const subscribers = this.typeToSubscribers.get(operation);
            if (!isUndefined(subscribers)) {
                if (
                    !subscribers.some((s2) => {
                        return s2 === subscriber;
                    })
                ) {
                    subscribers.push(subscriber);
                }
            }
        });
    }

    unsubscribe(
        operations: OperationType[] = [],
        subscriber: (event: OperationEvent) => Promise<OperationEventResponse>,
    ): void {
        operations.forEach((operation) => {
            if (this.typeToSubscribers.has(operation)) {
                // ts bumbles the fact that we set the eventName
                const subscribers = this.typeToSubscribers.get(operation);
                if (!isUndefined(subscribers)) {
                    const index = subscribers.indexOf(subscriber);
                    if (index !== -1) {
                        subscribers.splice(index, 1);
                    }
                }
            }
        });
    }
}
