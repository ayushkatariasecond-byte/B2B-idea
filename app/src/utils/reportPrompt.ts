import * as reportsApi from '../api/reports';
import { alert } from './alert';

const REASONS = ['Spam', 'Inappropriate content', 'Misleading', 'Other'];

export function promptReport(targetType: 'post' | 'comment' | 'business', targetId: string) {
  alert('Report this?', 'Choose a reason. Our team will review it.', [
    ...REASONS.map((reason) => ({
      text: reason,
      onPress: async () => {
        try {
          await reportsApi.reportContent({ targetType, targetId, reason });
          alert('Thanks', 'Your report has been submitted.');
        } catch {
          alert('Something went wrong', 'Please try again.');
        }
      },
    })),
    { text: 'Cancel', style: 'cancel' },
  ]);
}
