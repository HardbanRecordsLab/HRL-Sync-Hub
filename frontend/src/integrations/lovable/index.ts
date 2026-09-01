// Local auth shim. External OAuth providers are disabled for this app.

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (_provider: "google" | "apple", _opts?: SignInOptions) => {
      return { error: new Error('External OAuth login is disabled for this app.') };
    },
  },
};