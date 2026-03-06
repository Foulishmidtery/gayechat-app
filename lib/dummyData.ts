export interface User {
  id: string;
  name: string;
  avatar: string;
  color: string;
  bio?: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  icon: string;
  members?: string[];
}

export const DUMMY_USERS: User[] = [
  { id: "u1", name: "Alex Chen", avatar: "A", color: "bg-blue-500" },
  { id: "u2", name: "Sarah Smith", avatar: "S", color: "bg-green-500" },
  { id: "u3", name: "Jordan Lee", avatar: "J", color: "bg-purple-500" },
  { id: "u4", name: "Mia Wong", avatar: "M", color: "bg-rose-500" },
  { id: "u5", name: "David Kim", avatar: "D", color: "bg-amber-500" },
];

export const DUMMY_GROUPS: Group[] = [
  {
    id: "group-1",
    name: "General Chat",
    description: "A place for everyone to talk",
    icon: "Globe2",
  },
  {
    id: "group-2",
    name: "Tech Talk",
    description: "Discuss the latest in technology",
    icon: "Laptop",
  },
  {
    id: "group-3",
    name: "Gaming Hub",
    description: "For all the gamers out there",
    icon: "Gamepad2",
  },
];
