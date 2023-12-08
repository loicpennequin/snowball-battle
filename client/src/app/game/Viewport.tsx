import { PixiComponent, useApp } from "@pixi/react";
import { Viewport, type IViewportOptions } from "pixi-viewport";
import { DisplayObject } from "pixi.js";
import { ReactElement, ReactNode, forwardRef } from "react";

type Props = IViewportOptions & { plugins?: string[]; children?: ReactNode };
const PixiViewportComponent = PixiComponent<Props, DisplayObject>("Viewport", {
  create(props) {
    const { plugins, ...otherProps } = props;
    const viewport = new Viewport(otherProps);

    (plugins || []).forEach((plugin) => {
      viewport[plugin]();
    });

    return viewport;
  },

  applyProps(viewport, _oldProps, _newProps) {
    const {
      plugins: oldPlugins,
      children: oldChildren,
      ...oldProps
    } = _oldProps;
    const {
      plugins: newPlugins,
      children: newChildren,
      ...newProps
    } = _newProps;

    Object.keys(newProps).forEach((p) => {
      if (oldProps[p] !== newProps[p]) {
        viewport[p] = newProps[p];
      }
    });
  },
});

// create a component that can be consumed
// that automatically pass down the app
export const PixiViewport = forwardRef<Viewport, Omit<Props, "events">>(
  ({ children, ...props }, ref) => {
    const app = useApp();

    return (
      <PixiViewportComponent ref={ref} events={app.renderer.events} {...props}>
        {children}
      </PixiViewportComponent>
    );
  }
);
PixiViewport.displayName = "PixiViewport";
