using System.Drawing.Drawing2D;
namespace Onyx.Activity;
sealed class OnyxButton:Button {
 [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
 internal bool Primary{get;init;}
 bool hover;
 public OnyxButton(){FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;Cursor=Cursors.Hand;MinimumSize=new Size(70,38);SetStyle(ControlStyles.OptimizedDoubleBuffer|ControlStyles.UserPaint,true);}
 protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
 protected override void OnMouseLeave(EventArgs e){hover=false;Invalidate();base.OnMouseLeave(e);}
 protected override void OnPaint(PaintEventArgs e){
  e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;e.Graphics.Clear(Parent?.BackColor??BackColor);
  using var shape=new GraphicsPath();var box=new Rectangle(1,1,Width-3,Height-3);int d=14;shape.AddArc(box.Left,box.Top,d,d,180,90);shape.AddArc(box.Right-d,box.Top,d,d,270,90);shape.AddArc(box.Right-d,box.Bottom-d,d,d,0,90);shape.AddArc(box.Left,box.Bottom-d,d,d,90,90);shape.CloseFigure();
  var color=Primary&&Enabled?Color.FromArgb(15,188,139):hover&&Enabled?Color.FromArgb(40,57,64):Color.FromArgb(27,39,45);using var brush=new SolidBrush(color);using var pen=new Pen(Color.FromArgb(43,59,67));e.Graphics.FillPath(brush,shape);e.Graphics.DrawPath(pen,shape);
  var text=Enabled?(Primary?Color.FromArgb(5,25,20):ForeColor):Color.FromArgb(136,151,159);TextRenderer.DrawText(e.Graphics,Text,Font,ClientRectangle,text,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.SingleLine);
  if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(e.Graphics,Rectangle.Inflate(ClientRectangle,-5,-5),text,color);
 }
}
