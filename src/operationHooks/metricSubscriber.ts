import { OperationBroker, OperationEvent, OperationEventResponse, makeLogger } from 'fhir-works-on-aws-interface';

import { CloudWatchClient, PutMetricDataCommand, Dimension } from '@aws-sdk/client-cloudwatch';
import { isUndefined, chunk, isEmpty, toNumber } from 'lodash';

const METRIC_NAMESPACE = 'FWoA';
const METRIC_NAME = 'CallCount';
const logger = makeLogger({ component: 'metricSubscriber' });
const PUSH_INTERVAL_MS = !isUndefined(process.env.OP_METRIC_SUBSCRIBER_PUSH_INTERVAL_MS)
    ? toNumber(process.env.OP_METRIC_SUBSCRIBER_PUSH_INTERVAL_MS)
    : 60000;
const CONCURRENT_SEND_COUNT = !isUndefined(process.env.OP_METRIC_SUBSCRIBER_SEND_COUNT)
    ? toNumber(process.env.OP_METRIC_SUBSCRIBER_SEND_COUNT)
    : 25;

export default class MetricSubscriber {
    private client: CloudWatchClient;

    private sendMutex: boolean;

    private metricsMap: Map<string, number>;

    private sendMetricsHandle: any; // when ts is updated this should be typed "NodeJS.Timeout | undefined;"

    constructor(
        broker: OperationBroker,
        client: CloudWatchClient = new CloudWatchClient({}),
        sendMutex: boolean = false,
        metricsMap: Map<string, number> = new Map<string, number>(),
    ) {
        const that = this;
        this.client = client;
        this.sendMutex = sendMutex;
        this.metricsMap = metricsMap;

        if (process.env.OP_METRIC_SUBSCRIBER_ENABLED === 'true') {
            // wire up the events we care about
            broker.subscribe(
                [
                    'pre-create',
                    'post-create',
                    'pre-read',
                    'post-read',
                    'pre-vread',
                    'post-vread',
                    'pre-update',
                    'post-update',
                    'pre-delete',
                    'post-delete',
                    'pre-patch',
                    'post-patch',
                    'pre-history-type',
                    'post-history-type',
                    'pre-history-instance',
                    'post-history-instance',
                    'pre-search-type',
                    'post-search-type',
                    'pre-transaction',
                    'post-transaction',
                    'pre-batch',
                    'post-batch',
                    'pre-search-system',
                    'post-search-system',
                    'pre-history-system',
                    'post-history-system',
                ],
                (event: OperationEvent) => {
                    return that.handler(event);
                },
            );

            // start our function to push
            this.sendMetricsHandle = setInterval(() => {
                that.sendMetrics();
            }, PUSH_INTERVAL_MS);
        }
    }

    /**
     * interface implementation of the subscribe callback
     * @param event event context
     * @returns the results of processing the event
     */
    async handler(event: OperationEvent): Promise<OperationEventResponse> {
        // can't stop won't stop, so wrap this thang in a try/catch
        const errors: Error[] = [];
        const result = {
            success: true,
            errors,
        };
        try {
            // inc the operation
            const operationCount = (this.metricsMap.get(event.operation) || 0) + 1;
            this.metricsMap.set(event.operation, operationCount);

            // see if we have a tenantId
            if ('request' in event && !isUndefined(event.request)) {
                let key = '';
                let count = 0;
                if ('tenantId' in event.request && !isUndefined(event.request.tenantId)) {
                    // inc the operation+tenantId
                    key = `${event.operation}|${event.request.tenantId}`;
                    count = (this.metricsMap.get(key) || 0) + 1;
                    this.metricsMap.set(key, count);

                    if ('resourceType' in event.request && !isUndefined(event.request.resourceType)) {
                        key = `${event.operation}|${event.request.tenantId}|${event.request.resourceType}`;
                        count = (this.metricsMap.get(key) || 0) + 1;
                        this.metricsMap.set(key, count);
                    }
                } else if ('resourceType' in event.request && !isUndefined(event.request.resourceType)) {
                    key = `${event.operation}||${event.request.resourceType}`;
                    count = (this.metricsMap.get(key) || 0) + 1;
                    this.metricsMap.set(key, count);
                }
            }
        } catch (e: unknown) {
            result.success = false;
            if (typeof e === 'string') {
                result.errors.push(new Error(e.toString()));
            } else if (e instanceof Error) {
                result.errors.push(e);
            }
        }

        return result;
    }

    /**
     * internal helper method that periodically sends accumulated metrics to AWS cloudwatch
     * only exposed publicly for testing. Do not call directly
     */
    async sendMetrics(): Promise<void> {
        // we use a mutex here to maintain accuracy. If we don't have a mutex than
        // an async send call that takes longer than setInterval ticks will have
        // inaccurate overlapping metrics. On the opposite spectrum, w/lock and
        // wanting to maintain steady state, we will drop any metrics that are waiting
        // on previous runs to complete. Therefore, all data sync'd will be accurate
        // but we might lose some intervals due to long send times.

        // check our send lock and skip this run if a previous run is still sending
        if (!this.sendMutex && this.metricsMap.size > 0) {
            // set the send lock
            this.sendMutex = true;

            try {
                // compute the timestamp
                const timestamp = new Date();

                // first things first chunk up the current metrics into max 20 per send
                const entries = [...this.metricsMap.entries()];
                const metricChunks = chunk(entries, 20);
                const requestChunks = chunk(metricChunks, CONCURRENT_SEND_COUNT);

                // loop through the concurrent requests
                for (let i = 0; i < requestChunks.length; i += 1) {
                    const requestChunk = requestChunks[i];
                    // map each chunk of metrics to a single request
                    const sendPromises = requestChunk.map((metricChunk) => {
                        const metricData = metricChunk.map((metric) => {
                            const keys = metric[0].split('|');
                            const dimensions: Dimension[] = [{ Name: 'Operation', Value: keys[0] }];
                            if (keys.length >= 2 && !isEmpty(keys[1])) {
                                dimensions.push({
                                    Name: 'TenantId',
                                    Value: keys[1],
                                });
                            }

                            if (keys.length === 3 && !isEmpty(keys[2])) {
                                dimensions.push({
                                    Name: 'ResourceType',
                                    Value: keys[2],
                                });
                            }

                            return {
                                MetricName: METRIC_NAME,
                                Timestamp: timestamp,
                                Unit: 'Count',
                                Value: metric[1],
                                Dimensions: dimensions,
                            };
                        });

                        const command = new PutMetricDataCommand({
                            Namespace: METRIC_NAMESPACE,
                            MetricData: metricData,
                        });

                        return this.client.send(command);
                    });

                    // these metrics are best effort so just log the failures
                    // lint ignore for capping max number of concurrent requests
                    // eslint-disable-next-line no-await-in-loop
                    const results = await Promise.allSettled(sendPromises);

                    const failures = results.filter((r) => {
                        return r.status === 'rejected';
                        // lint ignore because it's not finding the type event though it's es2020
                        // eslint-disable-next-line no-undef
                    }) as PromiseRejectedResult[];
                    if (failures.length > 0) {
                        failures.forEach((f) => {
                            if ('reason' in f) {
                                logger.error('metric send failed', { reason: f.reason });
                            }
                        });
                    }
                }
            } catch (err) {
                logger.error('fatal error sending metrics', { err });
            } finally {
                // always release the lock regardless of run success|failure
                this.sendMutex = false;
            }
        }

        // always clear the results regardless of invocation run|skip
        // this keeps the metricsMap always accurate to the accumulation
        // over the interval
        this.metricsMap.clear();
    }

    /**
     * quasi destructor
     */
    destroy(): void {
        if (!isUndefined(this.sendMetricsHandle)) {
            clearInterval(this.sendMetricsHandle);
        }
    }
}
