import AudioStudio from "@/components/audio-studio";
import { generateToolMetadata } from "@/lib/metadata";

export const metadata = generateToolMetadata("/tools/audio");

export default function Page() {
  return <AudioStudio />;
}
