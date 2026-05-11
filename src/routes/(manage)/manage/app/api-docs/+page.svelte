<script lang="ts">
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";
  import { Button } from "$lib/components/ui/button/index.js";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";

  const apiDocsUrl = clientResolver(resolve, "/docs/spec/v4/");
</script>

<div class="flex w-full flex-col gap-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold">{$t("manage.api_docs.title")}</h1>
      <p class="text-muted-foreground mt-1 text-sm">{$t("manage.api_docs.description")}</p>
    </div>
    <Button variant="outline" href={apiDocsUrl} target="_blank">
      <ExternalLinkIcon class="mr-2 h-4 w-4" />
      {$t("manage.api_docs.open_full")}
    </Button>
  </div>

  <div class="border-border rounded-lg border">
    <iframe
      src={apiDocsUrl}
      title={$t("manage.api_docs.title")}
      class="h-[calc(100vh-12rem)] w-full rounded-lg"
      frameborder="0"
    ></iframe>
  </div>
</div>
