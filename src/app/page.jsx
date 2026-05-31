import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function RootPage() {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigate("/account/signin");
  }, []);

  return null;
}