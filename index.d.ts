declare namespace PouchDB {
    interface Database<Content extends {} = {}> {
        transform<NewContent>(config: {
            incoming?(doc: PouchDB.Core.Document<Content>): PouchDB.Core.Document<NewContent> | Promise<PouchDB.Core.Document<NewContent>>;
            outgoing?(doc: PouchDB.Core.Document<NewContent>): PouchDB.Core.Document<Content> | Promise<PouchDB.Core.Document<Content>>;
        }): void
    }
}

declare module "transform-pouch"{
    const plugin: PouchDB.Plugin & {transform: Function, filter: Function};
    export = plugin;
}