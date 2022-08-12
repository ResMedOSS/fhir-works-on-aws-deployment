import { OperationBroker } from 'fhir-works-on-aws-interface';
import * as sinon from 'sinon';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { Random } from 'random-js';
import _ from 'lodash';
import MetricSubscriber from './metricSubscriber';

const r = new Random();

describe('metricSubscriber', () => {
    const sandbox = sinon.createSandbox();
    const client = new CloudWatchClient({});
    const broker: OperationBroker = {
        publish: sinon.stub().resolves({
            success: true,
            responses: [],
            errors: [],
        }),
        subscribe: sinon.stub(),
        unsubscribe: sinon.stub(),
    };

    let subscriber: MetricSubscriber;

    beforeEach(async () => {
        sandbox.reset();

        client.send = sinon.stub().resolves({
            $metadata: {
                httpStatusCode: 201,
            },
        });

        broker.publish = sinon.stub().resolves({
            success: true,
            responses: [],
            errors: [],
        });

        process.env.OP_METRIC_SUBSCRIBER_ENABLED = 'true';
    });

    afterEach(async () => {
        subscriber.destroy();
    });

    describe('constructor', () => {
        test('OP_METRIC_SUBSCRIBER_ENABLED not true does not subscribe', async () => {
            process.env.OP_METRIC_SUBSCRIBER_ENABLED = 'false';

            subscriber = new MetricSubscriber(broker);

            expect((broker.subscribe as sinon.SinonStub).callCount).toBe(0);
        });

        test('OP_METRIC_SUBSCRIBER_ENABLED true subscribes', async () => {
            subscriber = new MetricSubscriber(broker);

            expect((broker.subscribe as sinon.SinonStub).callCount).toBe(1);
        });
    });

    describe('handler', () => {
        test('increments op count', async () => {
            const key = 'pre-create';
            const metricsMap = new Map<string, number>();
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            subscriber.handler({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
            });

            // @ts-ignore
            expect(metricsMap.has(key)).toBeTruthy();
            expect(metricsMap.get(key)).toEqual(1);
        });

        test('increments op, tenantId and resourceType', async () => {
            const tenantId = r.uuid4();
            const resourceType = r.string(32);
            const key = `pre-create|${tenantId}|${resourceType}`;
            const metricsMap = new Map<string, number>();
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            subscriber.handler({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
                request: {
                    tenantId,
                    resourceType,
                    resource: {},
                },
            });

            // @ts-ignore
            expect(metricsMap.has(key)).toBeTruthy();
            expect(metricsMap.get(key)).toEqual(1);
        });

        test('increments op, tenantId and resourceType', async () => {
            const tenantId = r.uuid4();
            const resourceType = r.string(32);
            const key = `pre-create|${tenantId}|${resourceType}`;
            const metricsMap = new Map<string, number>();
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            subscriber.handler({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
                request: {
                    tenantId,
                    resourceType,
                    resource: {},
                },
            });

            // @ts-ignore
            expect(metricsMap.has(key)).toBeTruthy();
            expect(metricsMap.get(key)).toEqual(1);
        });

        test('increments op, tenantId', async () => {
            const tenantId = r.uuid4();
            const key = `pre-search-system|${tenantId}`;
            const metricsMap = new Map<string, number>();
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            subscriber.handler({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-search-system',
                request: {
                    baseUrl: r.string(32),
                    tenantId,
                },
            });

            // @ts-ignore
            expect(metricsMap.has(key)).toBeTruthy();
            expect(metricsMap.get(key)).toEqual(1);
        });

        test('increments op, resourceType', async () => {
            const resourceType = r.string(32);
            const key = `pre-create||${resourceType}`;
            const metricsMap = new Map<string, number>();
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            subscriber.handler({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
                request: {
                    resourceType,
                    resource: {},
                },
            });

            // @ts-ignore
            expect(metricsMap.has(key)).toBeTruthy();
            expect(metricsMap.get(key)).toEqual(1);
        });
    });

    describe('sendMetrics', () => {
        describe('lock tests', () => {
            test('locked skips run', async () => {
                const metricsMap = new Map<string, number>();
                metricsMap.set('pre-create', 1);
                subscriber = new MetricSubscriber(broker, client, true, metricsMap);

                subscriber.sendMetrics();

                expect((client.send as sinon.SinonStub).callCount).toBe(0);
            });

            test('locked clears metricsMap', async () => {
                const metricsMap = new Map<string, number>();
                metricsMap.set('pre-create', 1);
                subscriber = new MetricSubscriber(broker, client, true, metricsMap);

                subscriber.sendMetrics();

                // @ts-ignore
                expect(metricsMap.size).toBe(0);
            });

            test('no metrics releases', async () => {
                const metricsMap = new Map<string, number>();
                subscriber = new MetricSubscriber(broker, client, false, metricsMap);

                subscriber.sendMetrics();

                expect((client.send as sinon.SinonStub).callCount).toBe(0);
            });
        });

        test.only('send throws fails silently', async () => {
            (client.send as sinon.SinonStub).reset();
            (client.send as sinon.SinonStub).throws();

            const metricsMap = new Map<string, number>();
            metricsMap.set('pre-create', 1);
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            let threw = false;
            try {
                subscriber.sendMetrics();
            } catch (e) {
                threw = true;
            }

            // @ts-ignore
            expect(metricsMap.size).toBe(0);

            expect((client.send as sinon.SinonStub).callCount).toBe(1);
            expect(threw).toBeFalsy();
        });

        test('partial send throws fails silently', async () => {
            (client.send as sinon.SinonStub).reset();
            (client.send as sinon.SinonStub).onCall(0).resolves();
            (client.send as sinon.SinonStub).onCall(1).throws();

            const metricsMap = new Map<string, number>();
            _.range(11).forEach(() => {
                metricsMap.set(r.string(32), 1);
            });
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            let threw = false;
            try {
                subscriber.sendMetrics();
            } catch (e) {
                threw = true;
            }

            // @ts-ignore
            expect(metricsMap.size).toBe(0);

            expect((client.send as sinon.SinonStub).callCount).toBe(2);
            expect(threw).toBeFalsy();
        });

        test('send rejected fails silently', async () => {
            (client.send as sinon.SinonStub).reset();
            (client.send as sinon.SinonStub).rejects();

            const metricsMap = new Map<string, number>();
            metricsMap.set('pre-create', 1);
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            let threw = false;
            try {
                subscriber.sendMetrics();
            } catch (e) {
                threw = true;
            }

            // @ts-ignore
            expect(metricsMap.size).toBe(0);

            expect((client.send as sinon.SinonStub).callCount).toBe(1);
            expect(threw).toBeFalsy();
        });

        test('partial send rejects fails silently', async () => {
            (client.send as sinon.SinonStub).reset();
            (client.send as sinon.SinonStub).onCall(0).resolves();
            (client.send as sinon.SinonStub).onCall(1).rejects();

            const metricsMap = new Map<string, number>();
            _.range(11).forEach(() => {
                metricsMap.set(r.string(32), 1);
            });
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            let threw = false;
            try {
                subscriber.sendMetrics();
            } catch (e) {
                threw = true;
            }

            // @ts-ignore
            expect(metricsMap.size).toBe(0);

            expect((client.send as sinon.SinonStub).callCount).toBe(2);
            expect(threw).toBeFalsy();
        });

        test('send request uses correct operation call count', async () => {
            const metricsMap = new Map<string, number>();
            const callCount = r.int32();
            metricsMap.set('pre-create', callCount);
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            subscriber.sendMetrics();

            expect((client.send as sinon.SinonStub).callCount).toBe(1);
            expect((client.send as sinon.SinonStub).getCall(0).args[0].MetricData[0].Value).toBe(callCount);
        });

        test('send request uses correct operation dimension', async () => {
            const metricsMap = new Map<string, number>();
            const operation = r.string(32);
            metricsMap.set(operation, 1);
            subscriber = new MetricSubscriber(broker, client, false, metricsMap);

            subscriber.sendMetrics();

            expect((client.send as sinon.SinonStub).callCount).toBe(1);
            expect((client.send as sinon.SinonStub).getCall(0).args[0].MetricData[0].Dimensions[0].Value).toBe(
                operation,
            );
        });
    });
});
