import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import serverResolve from "$lib/server/resolver.js";
import { GetLoggedInSession } from "$lib/server/controllers/controller.js";

export const load: PageServerLoad = async () => {
  throw redirect(302, serverResolve("/account/signin"));
};

export const actions: Actions = {
  default: async ({ cookies }) => {
    // Get user before clearing cookie so we can check user_type
    const loggedInUser = await GetLoggedInSession(cookies);

    cookies.delete("kener-user", { path: serverResolve("/") });

    // Redirect subscribers back to status page, others to signin
    if (loggedInUser?.user_type === "subscriber") {
      throw redirect(302, "/");
    }

    throw redirect(302, serverResolve("/account/signin"));
  },
};
