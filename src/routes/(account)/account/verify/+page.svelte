<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";

  const { data } = $props();
  const error: string = $derived(data.error || $t("account.verify.default_error"));
</script>

<svelte:head>
  <title>{$t("account.verify.title")}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Root class="kener-card w-full max-w-md">
    <Card.Header class="text-center">
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <AlertCircleIcon class="h-8 w-8 text-red-600" />
      </div>
      <Card.Title>{$t("account.verify.failed_title")}</Card.Title>
      <Card.Description>{error}</Card.Description>
    </Card.Header>
    <Card.Content>
      <Button href={clientResolver(resolve, "/account/signin")} class="w-full">
        <ArrowLeftIcon class="mr-2 h-4 w-4" />
        {$t("account.verify.btn_go_signin")}
      </Button>
    </Card.Content>
  </Card.Root>
</div>
