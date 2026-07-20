export type RootStackParamList = {
  Onboarding: undefined;
  Signup: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string };
  VerifyEmail: { token?: string };
  SuggestedFollows: undefined;
  Tabs: undefined;
  Compose: undefined;
  PostDetail: { postId: string };
  BusinessProfile: { businessId: string };
  EditProfile: undefined;
  Analytics: undefined;
  Thread: { threadId: string; otherName: string };
  Notifications: undefined;
  Drafts: undefined;
  TeamMembers: undefined;
  Saved: undefined;
  Settings: undefined;
};

export type TabParamList = {
  HomeFeed: undefined;
  Discover: undefined;
  Messages: undefined;
  ProfileTab: undefined;
};
