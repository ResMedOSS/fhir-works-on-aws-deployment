import { OperationEvent, OperationType, OperationEventResponse, GenericResponse } from 'fhir-works-on-aws-interface';
import * as sinon from 'sinon';
import * as _ from 'lodash';
import { Random } from 'random-js';
import OperationBroker from './operationBroker';

const r = new Random();

describe('operationBroker', () => {
    const sandbox = sinon.createSandbox();
    const subscriberFx = sandbox.stub();

    beforeEach(async () => {
        sandbox.reset();

        subscriberFx.resolves({
            success: true,
        });
    });

    describe('subscribe', () => {
        test('adds single operation to subscribers', async () => {
            const typeToSubscribers = new Map<
                OperationType,
                { (event: OperationEvent): Promise<OperationEventResponse> }[]
            >();
            const broker = new OperationBroker(typeToSubscribers);
            broker.subscribe(['pre-create'], subscriberFx);

            expect(typeToSubscribers.has('pre-create')).toBeTruthy();
            expect(typeToSubscribers.get('pre-create')?.indexOf(subscriberFx)).not.toBe(-1);
        });

        test('adds multiple operations to subscriber', async () => {
            const typeToSubscribers = new Map<
                OperationType,
                { (event: OperationEvent): Promise<OperationEventResponse> }[]
            >();
            const broker = new OperationBroker(typeToSubscribers);
            broker.subscribe(['pre-create', 'post-create'], subscriberFx);

            expect(typeToSubscribers.has('pre-create')).toBeTruthy();
            expect(typeToSubscribers.get('pre-create')?.indexOf(subscriberFx)).not.toBe(-1);
            expect(typeToSubscribers.has('post-create')).toBeTruthy();
            expect(typeToSubscribers.get('post-create')?.indexOf(subscriberFx)).not.toBe(-1);
        });

        test('dup does not double add', async () => {
            const typeToSubscribers = new Map<
                OperationType,
                { (event: OperationEvent): Promise<OperationEventResponse> }[]
            >();
            const broker = new OperationBroker(typeToSubscribers);
            broker.subscribe(['pre-create'], subscriberFx);
            broker.subscribe(['pre-create'], subscriberFx);

            expect(typeToSubscribers.has('pre-create')).toBeTruthy();
            expect(typeToSubscribers.get('pre-create')?.indexOf(subscriberFx)).not.toBe(-1);
            expect(typeToSubscribers.get('pre-create')?.length).toBe(1);
        });
    });

    describe('unsubscribe', () => {
        test('removed from single operation', async () => {
            const typeToSubscribers = new Map<
                OperationType,
                { (event: OperationEvent): Promise<OperationEventResponse> }[]
            >();
            const broker = new OperationBroker(typeToSubscribers);
            broker.subscribe(['pre-create'], subscriberFx);
            broker.unsubscribe(['pre-create'], subscriberFx);

            expect(typeToSubscribers.has('pre-create')).toBeTruthy();
            expect(typeToSubscribers.get('pre-create')?.indexOf(subscriberFx)).toBe(-1);
            expect(typeToSubscribers.get('pre-create')?.length).toBe(0);
        });
        test('removed from multiple operation', async () => {
            const typeToSubscribers = new Map<
                OperationType,
                { (event: OperationEvent): Promise<OperationEventResponse> }[]
            >();
            const broker = new OperationBroker(typeToSubscribers);
            broker.subscribe(['pre-create', 'post-create'], subscriberFx);
            broker.unsubscribe(['pre-create', 'post-create'], subscriberFx);

            expect(typeToSubscribers.has('pre-create')).toBeTruthy();
            expect(typeToSubscribers.get('pre-create')?.indexOf(subscriberFx)).toBe(-1);
            expect(typeToSubscribers.get('pre-create')?.length).toBe(0);
            expect(typeToSubscribers.has('post-create')).toBeTruthy();
            expect(typeToSubscribers.get('post-create')?.indexOf(subscriberFx)).toBe(-1);
            expect(typeToSubscribers.get('post-create')?.length).toBe(0);
        });
        test('only removes specified operation subscriptions', async () => {
            const typeToSubscribers = new Map<
                OperationType,
                { (event: OperationEvent): Promise<OperationEventResponse> }[]
            >();
            const broker = new OperationBroker(typeToSubscribers);
            broker.subscribe(['pre-create', 'post-create'], subscriberFx);
            broker.unsubscribe(['pre-create'], subscriberFx);

            expect(typeToSubscribers.has('pre-create')).toBeTruthy();
            expect(typeToSubscribers.get('pre-create')?.indexOf(subscriberFx)).toBe(-1);
            expect(typeToSubscribers.get('pre-create')?.length).toBe(0);
            expect(typeToSubscribers.has('post-create')).toBeTruthy();
            expect(typeToSubscribers.get('post-create')?.indexOf(subscriberFx)).not.toBe(-1);
            expect(typeToSubscribers.get('post-create')?.length).toBe(1);
        });
    });

    describe('publish', () => {
        test('passes correct date', async () => {
            const timeStamp = new Date();
            const broker = new OperationBroker();
            broker.subscribe(['pre-create'], subscriberFx);

            await broker.publish({
                userIdentity: [],
                timeStamp,
                operation: 'pre-create',
            });

            expect(subscriberFx.getCall(0).args[0].timeStamp).toBe(timeStamp);
        });

        test('passes correct request', async () => {
            const broker = new OperationBroker();
            broker.subscribe(['pre-create'], subscriberFx);
            const request = {
                resourceType: 'patient',
                resource: {},
            };
            await broker.publish({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
                request,
            });

            expect(subscriberFx.getCall(0).args[0].request).toBe(request);
        });

        test('passes correct response', async () => {
            const broker = new OperationBroker();
            broker.subscribe(['pre-create'], subscriberFx);
            const response = {
                message: r.string(32),
                resource: {},
            } as GenericResponse;
            await broker.publish({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
                response,
            });

            expect(subscriberFx.getCall(0).args[0].response).toBe(response);
        });

        test('sends to single subscriber', async () => {
            const broker = new OperationBroker();
            broker.subscribe(['pre-create'], subscriberFx);

            await broker.publish({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
            });

            expect(subscriberFx.callCount).toBe(1);
        });

        test('sends to multiple subscribers', async () => {
            const broker = new OperationBroker();
            const subscriberFx2 = sandbox.stub().resolves({ success: true });
            broker.subscribe(['pre-create'], subscriberFx);
            broker.subscribe(['pre-create'], subscriberFx2);

            await broker.publish({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
            });

            expect(subscriberFx.callCount).toBe(1);
            expect(subscriberFx2.callCount).toBe(1);
        });

        test('does not send to subscriber of different op', async () => {
            const broker = new OperationBroker();
            broker.subscribe(['post-create'], subscriberFx);

            await broker.publish({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
            });

            expect(subscriberFx.callCount).toBe(0);
        });

        test('returns success false if subscriber resolves w/success = false', async () => {
            const errorMessage = r.string(32);
            const broker = new OperationBroker();
            const subscriberFx2 = sandbox.stub().resolves({
                success: false,
                errors: [new Error(errorMessage)],
            });
            broker.subscribe(['pre-create'], subscriberFx);
            broker.subscribe(['pre-create'], subscriberFx2);

            const result = await broker.publish({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
            });

            expect(result.success).toBeFalsy();
            expect(result.errors.length).toBe(1);
            expect(result.errors[0].message).toBe(errorMessage);
        });

        test('returns success false if subscriber throws', async () => {
            const broker = new OperationBroker();
            const subscriberFx2 = sandbox.stub().throws();
            broker.subscribe(['pre-create'], subscriberFx);
            broker.subscribe(['pre-create'], subscriberFx2);

            const result = await broker.publish({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
            });

            expect(result.success).toBeFalsy();
            expect(result.errors.length).toBe(1);
        });

        test('returns success false if subscriber rejects', async () => {
            const errorMessage = r.string(32);
            const broker = new OperationBroker();
            const subscriberFx2 = sandbox.stub().rejects(errorMessage);
            broker.subscribe(['pre-create'], subscriberFx);
            broker.subscribe(['pre-create'], subscriberFx2);

            const result = await broker.publish({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
            });

            expect(result.success).toBeFalsy();
            expect(result.errors.length).toBe(1);
            expect(result.errors[0].message).toBe(errorMessage);
        });

        test('returns responses', async () => {
            const broker = new OperationBroker();
            const response1 = { success: true };
            const response2 = { success: true };
            subscriberFx.reset();
            subscriberFx.resolves(response1);
            const subscriberFx2 = sandbox.stub().resolves(response2);
            broker.subscribe(['pre-create'], subscriberFx);
            broker.subscribe(['pre-create'], subscriberFx2);

            const result = await broker.publish({
                userIdentity: [],
                timeStamp: new Date(),
                operation: 'pre-create',
            });

            expect(result.success).toBeTruthy();
            expect(result.errors.length).toBe(0);
            expect(result.responses.length).toBe(2);
            expect(_.indexOf(result.responses, response1)).not.toBe(-1);
            expect(_.indexOf(result.responses, response2)).not.toBe(-1);
        });
    });
});
