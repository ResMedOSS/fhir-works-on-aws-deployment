import { OperationBroker, OperationEvent, OperationEventResponse } from 'fhir-works-on-aws-interface';

// handler function for operation events
const handler = async (event: OperationEvent): Promise<OperationEventResponse> => {
    // can't stop won't stop, so wrap this thang in a try/catch
    const errors: Error[] = [];
    const result = {
        success: true,
        errors,
    };
    try {
        // simulating async waits here in the hooks
        // if you want async fire-n-forget return result right away
        // and schedule your logic on next tick w/setTimeout
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                console.log(event);
                resolve();
            });
        });
    } catch (e: unknown) {
        result.success = false;
        if (typeof e === 'string') {
            result.errors.push(new Error(e.toString()));
        } else if (e instanceof Error) {
            result.errors.push(e);
        }
    }

    return result;
};
export default (broker: OperationBroker): void => {
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
        handler,
    );
};
