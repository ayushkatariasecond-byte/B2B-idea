export type RootStackParamList = {
  Onboarding: undefined;
  Signup: undefined;
  Login: undefined;
  Tabs: undefined;
  Compose: undefined;
  PostDetail: { postId: string };
  BusinessProfile: { businessId: string };
  EditProfile: undefined;
  Analytics: undefined;
  Thread: { threadId: string; otherName: string };
};

export type TabParamList = {
  HomeFeed: undefined;
  Discover: undefined;
  Messages: undefined;
  ProfileTab: undefined;
};
