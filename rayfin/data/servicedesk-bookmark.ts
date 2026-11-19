import { authenticated, entity, text, uuid } from "@microsoft/rayfin-core";

@entity()
@authenticated("*", {
    policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class ServicedeskBookmark {
    @uuid()
    id!: string;

    @text({ max: 100 })
    name!: string;

    @text({ max: 4000 })
    filters!: string;

    @text({ max: 200 })
    user_id!: string;
}
