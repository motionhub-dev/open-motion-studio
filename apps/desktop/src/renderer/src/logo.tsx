// The Studio's application icon, shared with the packaged app and its window.
import icon from '../../../resources/icon.png';

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <img src={icon} width={size} height={size} alt="OpenMotionStudio" />
  );
}

// The name, split as its address is (openmotion.studio) and as the website sets it: OpenMotion in weight, Studio quiet.
export function Wordmark() {
  return (
    <strong className="wordmark">
      OpenMotion<span>Studio</span>
    </strong>
  );
}
