import fs from 'fs';
import path from 'path';
/* eslint-disable import/no-extraneous-dependencies */
import _ from 'lodash';
/*
Script to generate a map object to be used in tokenQuery.ts queryBuilder in fhir-works-on-aws-search-es

This replaces the need to use multi_match on each potential data type in a token field. This script currently
only supports parsing the fhir r4 specification and the entire compiler/queryBuilder context will need to be updated
to support custom IGs.

`npx ts-node build-token-data-types-map.ts $your-fhir-r4-spec-dir $your-output-file.json`
EG: npx ts-node ./scripts/build-token-data-types-map.ts ~/Downloads/definitions.json/ /tmp/map.json
*/

(async () => {
    try {
        console.log("let's create this thang.");

        let specPath = '';
        let outputPath = '';
        if (process.argv.length < 4) {
            console.log('please pass in the file paths to your FHIR r4 spec dir and an output file');
            process.exit(1);
        }
        [, , specPath, outputPath] = process.argv;

        // parse the public collection
        console.log(`parsing FHIR r4 spec, ${specPath}`);
        const searchJSON = await fs.promises.readFile(path.join(specPath, 'search-parameters.json'), 'utf-8');
        const profilesJSON = await fs.promises.readFile(path.join(specPath, 'profiles-resources.json'), 'utf-8');

        const searchParameters = JSON.parse(searchJSON).entry;
        const profiles = JSON.parse(profilesJSON).entry;
        console.log('parsing complete');

        // key entries so we have a O(1) lookup
        const profilesMap = new Map();
        profiles.forEach((profile: any) => {
            profilesMap.set(profile.resource.id, profile);
        });

        const result: any = {};
        searchParameters.forEach((searchParameter: any) => {
            if (searchParameter.resource.type === 'token') {
                console.log(`found token search parameter ${searchParameter.resource.id}`);

                if (_.has(searchParameter, 'resource') && _.has(searchParameter.resource, 'expression')) {
                    const expressions = searchParameter.resource!.expression!.split('|').map((e: string) => {
                        return e.trim();
                    });
                    searchParameter.resource.base.forEach((b: string) => {
                        console.log(`found base type ${b}`);

                        if (profilesMap.has(b)) {
                            const profile = profilesMap.get(b);

                            if (result[b] === undefined) {
                                result[b] = {};
                            }

                            // find the expression(s)
                            const baseExpressions = expressions.filter((e: string) => {
                                return e.indexOf(b) !== -1;
                            });

                            // find the resource profile definitions
                            baseExpressions.forEach((be: string) => {
                                console.log(`found base expression ${be}`);

                                // we need to prune all the fhirpath syntax away from the path
                                const r = new RegExp(`${b}\\S*`);
                                const matches = r.exec(be);

                                // now see if we can find the path in the profile resources
                                if (matches!.length > 0) {
                                    matches?.forEach((match) => {
                                        const expressionPath = match.trim().replace(`${b}.`, '').toLowerCase();
                                        result[b][expressionPath] = [];

                                        let found = false;
                                        profile.resource.snapshot.element.forEach((el: any) => {
                                            if (match === el.path) {
                                                console.log(`found matching element path for expression ${match}`);

                                                const codes = el.type.filter((t: any) => {
                                                    const keys = _.keys(t);
                                                    return keys.length === 1 && keys[0] === 'code';
                                                });

                                                if (codes.length > 0) {
                                                    result[b][expressionPath] = result[b][expressionPath].concat(codes);
                                                    found = true;
                                                }
                                            }
                                        });
                                        if (!found) {
                                            console.log(`did not find a matching element path for expression ${match}`);
                                            delete result[b][expressionPath];
                                        }
                                    });
                                } else {
                                    console.log(`could not find a matching path for expression ${be}`);
                                }
                            });
                        } else {
                            console.log(`not able to find profile for base resource ${b}`);
                        }
                    });
                }
            }
        });

        // prune any resources that did not have any results
        const keysToDelete = _.keys(result).filter((key) => {
            return _.keys(result[key]).length === 0;
        });

        keysToDelete.forEach((key) => {
            delete result[key];
        });

        await fs.promises.writeFile(outputPath, JSON.stringify(result));

        console.log('created new postman collection for fwoa');
    } catch (err) {
        console.log('Errors gumming up the works.');
        console.log(err);
        process.exit(1);
    }
})();
