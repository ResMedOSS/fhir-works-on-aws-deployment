# Operation Hooks
Operation Hooks is a way for listening and running your logic internal to the FHIRServer lambda when various `pre` and `post` FHIR operations happen. Operation hooks solves the problem of having to update each and every touch point for FHIR operations whenever you want to perform additional logic. In addition, operation hooks provide visibility into `read` FHIR operations and also allow for performing your logic before the FHIR client's response is returned.

## Processing
Your subscriber will interact with an OperationBroker instance, which is a gateway for subscribing to the operations you're interested in. Your subscriber will subscribe with the OperationBroker by indicating the `pre` and `post` operation types, you're interested in and the handler function that will be called when those events are fired.

Once you've registered your handler function, you will begin to receive the events and can execute your operations. Once complete with your operations, your handler function needs to return an instance of the OperationEventResponse interface which indicates if your operation was successful and if not what errors should be bubbled up to address. Keep in mind that if you indicate to the OperationBroker in your handler response that your operation was unsuccesful then the calling code doing the operation will be notified and can potentially change control flow. For example, if you return `false` value for `success` an endpoint handling a FHIR operation can and most likely will decide that it should return a HTTP 500 error to the client. So, while your subscriber code is not directly changing control flow like a distributed transaction model, it can affect the control flow of the calling code.

### Error Handling
Your subscriber's handler function should not throw exceptions and should not raise unhandled promise exceptions. Your code should handle exceptions internally and return the state of processing using the OperationEventResponse. This includes making sure your handler does not generate any unhandled promise exceptions on any asynchronous calls.

## Example subscriber
see [./consoleSubscriber.ts](./consoleSubscriber.ts)

## When Should I use Operation Hooks vs Subscriptions?
By default you should always try to use Subscriptions unless your requirements cannot be satisfied by the Subscriptions specification. With Subscriptions, you get a 1st class citizen method for receiving events from the FHIR server that is decoupled not only from the FHIR Server component but also the internal implementation of the FHIR Server.

Examples of when an internal Operational Hook would be neccessary are when you care about read operations (like auditing and compliance) or you want your logic to run before the FHIR Server REST response is sent to the client (like updating an authz service).