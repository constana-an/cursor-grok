import { HeartFilledIcon, PaperPlaneIcon, StarFilledIcon } from "@radix-ui/react-icons";
import type { MenuItem, Order } from "../lib/types";

export function MenuArt({ item }: { item: MenuItem | Order }) {
  if (item.image) return <img className="menu-art-image" src={item.image} alt="" draggable="false" />;
  // An Order carries its kind as `itemCategory`; testing for `category` alone
  // made every artless order — that is, every custom wish — show the star.
  const category = "category" in item ? item.category : item.itemCategory;
  const isCare = category === "care";
  const isDate = category === "date";
  return (
    <span className="menu-art-symbol" aria-hidden="true">
      {isCare ? <HeartFilledIcon /> : isDate ? <PaperPlaneIcon /> : <StarFilledIcon />}
    </span>
  );
}
